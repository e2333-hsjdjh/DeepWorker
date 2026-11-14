// DSH HTTP protocol client: JSON client-request / client-response envelopes.
//
// Every request carries a fresh UUID rpcId. Responses are validated against
// that rpcId and against `result.ok`; any mismatch or failure surfaces as a
// clear DshApiError instead of being silently ignored.

import crypto from "node:crypto";

import { baseUrl } from "./config.js";
import { modernEnabled, modernRequest, workspaceBaseline } from "./modern.js";

async function modernPost(method, payload, timeoutMs) {
  switch (method) {
    case "host.describe": return modernRequest("settings/describe", {}, timeoutMs);
    case "workspace.list": return workspaceBaseline();
    case "session.list": return modernRequest("session/list", { _request: payload }, timeoutMs);
    case "session.prompt":
      return modernRequest("session/prompt", { request: { ...payload, requestId: crypto.randomUUID() } }, timeoutMs);
    case "session.history": {
      const { sessionId, maxMessages } = payload;
      const page = await modernRequest("session/page", {
        request: { address: { kind: "session", sessionId }, maxMessages },
      }, timeoutMs);
      return { ...page, events: page.records };
    }
    default: return modernRequest(method.replace(".", "/"), { request: payload }, timeoutMs);
  }
}

export const REQUEST_TIMEOUT_MS = 35000;
export const RESPOND_TIMEOUT_MS = 15000;

export class DshApiError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "DshApiError";
  }
}

function jsonBody(message, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const req = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
    signal: controller.signal,
    redirect: "error",
  };
  return { req, timer, controller };
}

// POST a client-request to /api/<method> and return result.value.
export async function post(method, payload, { timeoutMs = REQUEST_TIMEOUT_MS, http = fetch } = {}) {
  if (modernEnabled()) return modernPost(method, payload, timeoutMs);
  const rpcId = crypto.randomUUID();
  const body = { type: "client-request", rpcId, method, payload };
  const { req, timer } = jsonBody(body, timeoutMs);
  let response;
  try {
    response = await http(`${baseUrl()}/api/${method}`, req);
  } catch (err) {
    clearTimeout(timer);
    throw new DshApiError(`DSH API unavailable at ${baseUrl()}: ${err.message}`);
  }
  clearTimeout(timer);

  if (!response.ok) {
    throw new DshApiError(`DSH API HTTP ${response.status} for ${method}`);
  }

  let envelope;
  try {
    envelope = await response.json();
  } catch (err) {
    throw new DshApiError(`DSH API returned non-JSON for ${method}: ${err.message}`);
  }

  if (envelope.rpcId !== rpcId) {
    throw new DshApiError("DSH API returned a mismatched rpcId");
  }

  const result = envelope.result || {};
  if (!result.ok) {
    const detail = result.error || {};
    throw new DshApiError(
      `${method}: ${detail.code || "error"}: ${detail.message || JSON.stringify(detail)}`,
    );
  }

  return result.value || {};
}

// Respond to a pending approval envelope via /api/respond.
export async function respond(rpcId, value, { timeoutMs = RESPOND_TIMEOUT_MS, http = fetch } = {}) {
  const body = { type: "client-response", rpcId, result: { ok: true, value } };
  const { req, timer } = jsonBody(body, timeoutMs);
  let response;
  try {
    response = await http(`${baseUrl()}/api/respond`, req);
  } catch (err) {
    clearTimeout(timer);
    throw new DshApiError(`DSH API respond failed: ${err.message}`);
  }
  clearTimeout(timer);

  let envelope;
  try {
    envelope = await response.json();
  } catch {
    return {};
  }
  return envelope;
}
