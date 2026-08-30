// Helper for JSON-RPC protocol tests: exercises the request handlers against
// an in-memory store with injected HTTP (fetch) and a fake WebSocket monitor.

import { handleEnvelope } from "../src/server.js";
import { EventMonitor } from "../src/events.js";
import { stateDir } from "../src/config.js";

// A minimal EventMonitor subclass that records pending approvals without
// touching any network.
export class FakeMonitor extends EventMonitor {
  constructor() {
    super();
    // Never dial the network: ensure() is a no-op for our tests.
    this.ensure = () => {};
  }

  recordApproval(rpcId, payload) {
    this.pending.set(payload.approvalId, { rpcId, payload, receivedAt: Date.now() / 1000 });
    this.events.push({ rpcId, payload, receivedAt: Date.now() / 1000 });
  }
}

// Wrap handleEnvelope for tools/call; returns the decoded tool result value.
export async function callTool(name, args, { http, monitor } = {}) {
  const m = monitor || new FakeMonitor();
  const out = await handleEnvelope(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args || {} } },
    { monitor: m, http },
  );
  const text = out.result.content[0].text;
  const value = JSON.parse(text);
  return { out, value, isError: out.result.isError, monitor: m };
}

export async function collect(stdinLines) {
  return stdinLines;
}

export function tmpStateDir(t) {
  // Tests that touch lifecycle should set DEEPWORKER_STATE_DIR explicitly;
  // this helper documents the intent.
  return stateDir();
}
