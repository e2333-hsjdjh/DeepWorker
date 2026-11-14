// Tool dispatch: maps each dsh_* tool name to its implementation.
//
// Every handler returns a plain object that gets JSON-serialized into the
// tool result content. Handlers throw ordinary Error/TypeError on bad input;
// the JSON-RPC layer converts those into `isError: true` results with a clear
// `error` field, mirroring the reference implementation.

import fs from "node:fs";
import path from "node:path";

import { post, respond } from "./rpc.js";
import { modernApprovals, modernDecision, modernEnabled, modernStatus } from "./modern.js";
import { startWeb, stopWeb, status } from "./lifecycle.js";
import { requireExistingDir, validateProjectName, bounded } from "./validate.js";

function compactSession(item) {
  const projections = (item.projections && item.projections.values) || {};
  return {
    sessionId: item.sessionId,
    running: item.running,
    blank: item.blank,
    cwd: item.cwd,
    agentPreset: item.agentPreset,
    updatedAt: item.updatedAt,
    title: projections.title,
    goal: projections.goal,
    permissions: projections.permissions,
  };
}

// Normalize one raw history entry into { event, view }, accepting two wire
// shapes produced by DSH:
//   - wrapped (current host schema): { event: {type,seq,time,data}, view? }
//   - flat top-level persisted event:  { type, seq, time, data, view?, ... }
function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return { event: {}, view: undefined };
  if (entry.event && typeof entry.event === "object") {
    return { event: entry.event, view: entry.view };
  }
  // Flat shape: the entry is the session event itself; keep its extra keys
  // (view, surfaceOp, ignorable, ...) separately from the event core.
  const { view, ...event } = entry;
  return { event, view };
}

export function compactHistory(raw, sessionId, maxMessages) {
  const rows = [];
  for (const entry of raw.events || []) {
    const { event, view } = normalizeHistoryEntry(entry);
    const kind = event.type || "";
    const data = event.data || {};
    if (kind === "user/message" && ((data.source || {}).kind || "") !== "user") continue;
    if (kind === "assistant/message") {
      const message = data.message || {};
      const text = (message.content || []).filter((part) => part.type === "text");
      rows.push({ seq: event.seq, type: kind, content: bounded(text), usage: data.usage });
    } else if (kind === "user/message") {
      rows.push({ seq: event.seq, type: kind, content: bounded(data.content || []) });
    } else if (
      kind.startsWith("tool/") ||
      kind.startsWith("approval/") ||
      ["turn/start", "turn/end", "step/end"].includes(kind)
    ) {
      rows.push({ seq: event.seq, type: kind, data: bounded(data), view: bounded(view) });
    }
  }
  return { sessionId, events: rows, hasMore: raw.hasMore || false, maxMessages };
}

async function dsh_create_project(args) {
  const parent = requireExistingDir(args.parent, "parent");
  const name = validateProjectName(args.name);
  const preset = args.agent_preset ?? (modernEnabled() ? undefined : "standard");
  const title = args.title;

  let created;
  if (modernEnabled()) {
    const projectPath = path.join(parent, name);
    await fs.promises.mkdir(projectPath);
    created = { path: projectPath };
  } else {
    created = await post("host.createDirectory", { path: parent, name });
  }
  const workspaceResult = await post("workspace.create", { path: created.path });
  const workspace = workspaceResult.workspace;
  const session = await post("session.create", {
    workspaceId: workspace.workspaceId,
    agentPreset: preset,
  });
  if (title) {
    await post("session.rename", { sessionId: session.sessionId, title });
  }
  return { projectPath: created.path, workspace, session };
}

async function dsh_create_session(args) {
  const root = requireExistingDir(args.workspace, "workspace");
  const preset = args.agent_preset ?? (modernEnabled() ? undefined : "standard");
  const title = args.title;

  const workspaceResult = await post("workspace.create", { path: root });
  const workspace = workspaceResult.workspace;
  const session = await post("session.create", {
    workspaceId: workspace.workspaceId,
    agentPreset: preset,
  });
  if (title) {
    await post("session.rename", { sessionId: session.sessionId, title });
  }
  return { workspace, session };
}

async function dsh_list_sessions() {
  const [workspaces, sessions] = await Promise.all([post("workspace.list", {}), post("session.list", {})]);
  return {
    workspaces: (workspaces.items || []).map((item) => ({
      workspaceId: item.workspaceId,
      path: item.path,
      title: item.title,
      sessionIds: item.sessionIds || [],
    })),
    sessions: (sessions.items || []).map(compactSession),
    archivedSessionIds: workspaces.archivedSessionIds || [],
  };
}

async function dsh_send(args) {
  return post("session.prompt", {
    sessionId: args.session_id,
    mode: args.mode ?? "queue",
    content: [{ type: "text", text: args.message }],
  });
}

async function dsh_wait(args, deps) {
  const sessionId = args.session_id;
  const timeoutSec = Math.max(0, Math.min(args.timeout_sec ?? 30, 60));
  const monitor = deps.monitor;
  if (!modernEnabled()) monitor?.ensure();
  const deadline = Date.now() + timeoutSec * 1000;
  for (;;) {
    const pending = modernEnabled() ? await modernApprovals(sessionId) : monitor?.snapshot(sessionId) ?? [];
    if (pending.length) return { state: "approval-required", pendingApprovals: pending };
    const sessions = await post("session.list", {});
    const row = (sessions.items || []).find((item) => item.sessionId === sessionId);
    if (!row) return { state: "not-found", sessionId };
    if (!row.running) {
      const history = await dsh_history({ session_id: sessionId, max_messages: 20 });
      return { state: "idle", session: row, history };
    }
    if (Date.now() >= deadline) {
      return { state: "running", session: row, recentEvents: monitor?.recent(sessionId, 50) ?? [] };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function dsh_history(args) {
  const sessionId = args.session_id;
  const maxMessages = Math.max(1, Math.min(args.max_messages ?? 30, 100));
  const raw = await post("session.history", { sessionId, maxMessages });
  return compactHistory(raw, sessionId, maxMessages);
}

async function dsh_pending_approvals(args, deps) {
  if (modernEnabled()) return { items: await modernApprovals(args.session_id) };
  deps.monitor.ensure();
  return { items: deps.monitor.snapshot(args.session_id ?? null) };
}

async function dsh_decide_approval(args, deps) {
  if (!["allowed-once", "rejected"].includes(args.outcome)) throw new Error("无效的审批结果");
  if (modernEnabled()) return modernDecision(args.approval_id, args.outcome);
  deps.monitor.ensure();
  const approvalId = args.approval_id;
  const row = deps.monitor
    .snapshot()
    .find((item) => item.payload.approvalId === approvalId);
  if (!row) {
    throw new Error("approval is not pending or has not been observed on the event stream");
  }
  const payload = row.payload;
  const receipt = await respond(row.rpcId, {
    sessionId: payload.sessionId,
    approvalId,
    outcome: args.outcome,
  });
  return { receipt, request: row };
}

async function dsh_cancel(args) {
  return post("session.cancel", { sessionId: args.session_id });
}

async function dsh_status(_args, deps) {
  const base = await status();
  // Include the event-stream view matching the plugin target. Read-only:
  // does not force a connection; a monitor that never started reports
  // connected=false with no error.
  const stream = modernEnabled()
    ? modernStatus()
    : deps?.monitor?.status() ?? { connected: false, lastError: null };
  return { ...base, eventStream: stream };
}

async function dsh_start() {
  return startWeb();
}

async function dsh_stop() {
  return stopWeb();
}

const HANDLERS = {
  dsh_status,
  dsh_start,
  dsh_stop,
  dsh_create_project,
  dsh_create_session,
  dsh_list_sessions,
  dsh_send,
  dsh_wait,
  dsh_history,
  dsh_pending_approvals,
  dsh_decide_approval,
  dsh_cancel,
};

// Dispatch a tool by name. Uses an in-memory EventMonitor by default; tests or
// the server inject their own for the wait/approval tools.
export async function dispatch(name, args, deps = {}) {
  const monitor = deps.monitor;
  if (!hasTool(name)) throw new Error(`unknown tool: ${name}`);
  const handler = HANDLERS[name];
  return handler(args, { monitor });
}

export function hasTool(name) {
  return Object.prototype.hasOwnProperty.call(HANDLERS, name);
}

export { fs, path };
