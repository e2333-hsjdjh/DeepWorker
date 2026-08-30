// JSON-RPC protocol: initialize, tools/list, unknown method, parse error.

import test from "node:test";
import assert from "node:assert/strict";

import { handleEnvelope, VERSION } from "../src/server.js";
import { TOOLS } from "../src/tools-schema.js";

test("initialize returns server info and capabilities", async () => {
  const out = await handleEnvelope({ jsonrpc: "2.0", id: 7, method: "initialize", params: {} });
  assert.equal(out.id, 7);
  assert.equal(out.result.protocolVersion, "2025-06-18");
  assert.equal(out.result.serverInfo.name, "deepworker");
  assert.equal(out.result.serverInfo.version, VERSION);
  assert.deepEqual(out.result.capabilities, { tools: {} });
});

test("tools/list returns 12 dsh_* tools", async () => {
  const out = await handleEnvelope({ jsonrpc: "2.0", id: 8, method: "tools/list" });
  assert.equal(out.result.tools.length, 12);
  const names = out.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "dsh_cancel",
    "dsh_create_project",
    "dsh_create_session",
    "dsh_decide_approval",
    "dsh_history",
    "dsh_list_sessions",
    "dsh_pending_approvals",
    "dsh_send",
    "dsh_start",
    "dsh_status",
    "dsh_stop",
    "dsh_wait",
  ]);
  for (const tool of TOOLS) {
    assert.ok(tool.inputSchema, `missing inputSchema for ${tool.name}`);
  }
});

test("unknown method returns -32601", async () => {
  const out = await handleEnvelope({ jsonrpc: "2.0", id: 9, method: "nope" });
  assert.equal(out.error.code, -32601);
  assert.match(out.error.message, /Method not found/);
});

test("tools/call for unknown tool returns isError result", async () => {
  const out = await handleEnvelope({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: { name: "dsh_unknown", arguments: {} },
  });
  assert.equal(out.result.isError, true);
  assert.match(out.result.content[0].text, /unknown tool/);
});
