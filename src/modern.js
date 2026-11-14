// DSH 0.2.2 Remote transport. An isolated API peer owns one mux socket.
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { readFileSync } from "node:fs";
import { baseUrl, logFile } from "./config.js";
import { ownedProcess } from "./ownership.js";

function launchToken() {
  const external = process.env.DEEPWORKER_DSH_TOKEN;
  if (external) return external;
  if (!ownedProcess()) return undefined;
  try {
    const log = readFileSync(logFile(), "utf8");
    const entry = log.match(/^dsh web: (http:\/\/[^\s]+)$/m)?.[1];
    if (!entry) return undefined;
    const url = new URL(entry);
    if (url.origin === baseUrl()) return url.searchParams.get("token") ?? undefined;
  } catch {
    return undefined;
  }
}

export const modernEnabled = () => Boolean(current?.ws.readyState === WebSocket.OPEN || launchToken());

let current;
let connecting;

async function rpc(peer, method, args, timeoutMs = 35000) {
  const rpcId = randomUUID();
  const response = await fetch(`${baseUrl()}/api/${method}`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
    headers: { "content-type": "application/json", cookie: peer.cookie },
    body: JSON.stringify({ type: "client-request", rpcId, method, payload: { args } }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`DSH API HTTP ${response.status} for ${method}`);
  }
  const envelope = await response.json();
  if (envelope.type !== "server-response" || envelope.rpcId !== rpcId) {
    throw new Error(`DSH 返回无效响应：${method}`);
  }
  if (envelope.result?.ok !== true) {
    const error = envelope.result?.error;
    throw new Error(`${method}: ${error?.code ?? "error"}: ${error?.message ?? "invalid result"}`);
  }
  return envelope.result.value;
}

async function connect() {
  const url = new URL("/connect", baseUrl());
  const token = launchToken();
  if (!token) throw new Error("缺少 DSH 启动令牌");
  url.searchParams.set("token", token);
  url.searchParams.set("interactions", "answer");
  const response = await fetch(url, {
    headers: { accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(5000),
  });
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  const location = response.headers.get("location");
  await response.body?.cancel();
  if (response.status !== 302 || !cookie || !location) {
    throw new Error(`DSH 鉴权失败（HTTP ${response.status}）。请检查启动令牌。`);
  }
  const socketUrl = new URL(location, url);
  if (socketUrl.origin !== url.origin || socketUrl.pathname !== "/api/remote.mux") {
    throw new Error("DSH 返回了无效的 WebSocket 地址");
  }
  socketUrl.protocol = "ws:";
  const ws = new WebSocket(socketUrl, { headers: { cookie }, handshakeTimeout: 5000, maxPayload: 8 * 1024 * 1024 });
  const peer = { ws, cookie, pending: new Map(), streams: new Map(), deciding: new Set(), clientId: null };
  const eventsId = randomUUID();
  ws.on("message", raw => {
    let frame;
    try { frame = JSON.parse(raw.toString()); } catch { return; }
    if (frame.streamId === eventsId) {
      const event = frame.value;
      if (frame.type !== "item" || !event) { ws.close(); return; }
      if (event.type === "ready") peer.clientId = event.clientId;
      if (event.type === "cancel") peer.pending.delete(event.eventId);
      if (event.type === "waterfall" && event.event === "approval/request") {
        peer.pending.set(event.eventId, {
          approvalId: event.eventId, sessionId: event.agentId,
          tool: event.request.toolName, callId: event.request.callId, reason: event.request.displayReason ?? event.request.reason,
        });
      } else if (event.type === "waterfall") {
        rpc(peer, "$events/result", {
          clientId: peer.clientId, eventId: event.eventId, outcome: { kind: "next" },
        }).catch(() => ws.close());
      }
      return;
    }
    peer.streams.get(frame.streamId)?.(frame);
  });
  ws.on("error", () => {});
  ws.on("close", () => {
    if (current === peer) current = undefined;
    peer.pending.clear();
    for (const receive of peer.streams.values()) receive({ type: "end" });
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
    ws.once("close", () => reject(new Error("DSH WebSocket 已关闭")));
  });
  ws.send(JSON.stringify({ type: "open", streamId: eventsId, endpoint: "$events", payload: { args: {} } }));
  const deadline = Date.now() + 5000;
  while (!peer.clientId && ws.readyState === WebSocket.OPEN && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!peer.clientId) {
    ws.terminate();
    throw new Error("DSH 交互事件流未就绪");
  }
  return peer;
}

async function getPeer() {
  if (current?.ws.readyState === WebSocket.OPEN) return current;
  connecting ??= connect().then(peer => (current = peer)).finally(() => { connecting = undefined; });
  return connecting;
}

export function modernStatus() {
  return { connected: current?.ws.readyState === WebSocket.OPEN, lastError: null };
}

export function closeModern() {
  current?.ws.terminate();
}

export async function modernRequest(method, args, timeoutMs) {
  return rpc(await getPeer(), method, args, timeoutMs);
}

export async function modernApprovals(sessionId) {
  const peer = await getPeer();
  return [...peer.pending.values()].filter(item => sessionId == null || item.sessionId === sessionId)
    .map(payload => ({ rpcId: payload.approvalId, payload }));
}

export async function modernDecision(approvalId, outcome) {
  const peer = await getPeer();
  const payload = peer.pending.get(approvalId);
  if (!payload || peer.deciding.has(approvalId)) throw new Error("该审批当前不可处理");
  if (!["allowed-once", "rejected"].includes(outcome)) throw new Error("无效的审批结果");
  peer.deciding.add(approvalId);
  try {
    const receipt = await rpc(peer, "$events/result", {
      clientId: peer.clientId, eventId: approvalId, outcome: { kind: "result", value: outcome },
    });
    peer.pending.delete(approvalId);
    return { receipt, request: { rpcId: approvalId, payload } };
  } finally {
    peer.deciding.delete(approvalId);
  }
}

export async function workspaceBaseline() {
  const peer = await getPeer();
  const streamId = randomUUID();
  return new Promise((resolve, reject) => {
    const finish = (error, value) => {
      clearTimeout(timer);
      peer.streams.delete(streamId);
      if (peer.ws.readyState === WebSocket.OPEN) peer.ws.send(JSON.stringify({ type: "cancel", streamId }));
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("读取 DSH 工作区超时")), 5000);
    peer.streams.set(streamId, frame => {
      if (frame.type === "item" && frame.value?.type === "baseline") return finish(null, frame.value.value);
      finish(new Error(frame.error?.message ?? "DSH 工作区流返回无效数据"));
    });
    peer.ws.send(JSON.stringify({ type: "open", streamId, endpoint: "workspace/follow", payload: { args: {} } }));
  });
}
