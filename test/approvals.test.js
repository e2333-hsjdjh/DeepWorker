// Pending approvals and approve/reject flow over a local mock DSH server.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { dispatch } from "../src/tools.js";
import { FakeMonitor } from "./helpers.js";

function startMock(handler) {
  const server = http.createServer((req, res) => {
    // Faithful to real DSH: reject missing/wrong Content-Type with 415.
    if (req.headers["content-type"] !== "application/json") {
      res.writeHead(415, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Unsupported Media Type" }));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const envelope = JSON.parse(body || "{}");
      const result = handler(envelope, req);
      res.writeHead(result.status || 200, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          result.body ?? { rpcId: envelope.rpcId, result: { ok: true, value: result.value ?? {} } },
        ),
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      process.env.DEEPWORKER_HOST = "127.0.0.1";
      process.env.DEEPWORKER_PORT = String(server.address().port);
      resolve({ server });
    });
  });
}

test("pending_approvals lists observed approvals, filtered by session", async () => {
  const monitor = new FakeMonitor();
  monitor.recordApproval("rpc-1", {
    type: "approval/requested",
    approvalId: "a1",
    sessionId: "s1",
    tool: "bash",
  });
  monitor.recordApproval("rpc-2", {
    type: "approval/requested",
    approvalId: "a2",
    sessionId: "s2",
    tool: "write",
  });

  const all = await dispatch("dsh_pending_approvals", {}, { monitor });
  assert.equal(all.items.length, 2);

  const filtered = await dispatch("dsh_pending_approvals", { session_id: "s1" }, { monitor });
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].payload.approvalId, "a1");
});

test("decide_approval rejects an unknown or already-resolved approval", async () => {
  const monitor = new FakeMonitor();
  await assert.rejects(
    () => dispatch("dsh_decide_approval", { approval_id: "nope", outcome: "allowed-once" }, { monitor }),
    /not pending/,
  );
});

test("decide_approval posts a client-response to /api/respond with outcome", async () => {
  const monitor = new FakeMonitor();
  monitor.recordApproval("rpc-9", {
    type: "approval/requested",
    approvalId: "a9",
    sessionId: "s9",
    tool: "bash",
  });

  let received = null;
  const { server } = await startMock((env, req) => {
    if (req.url === "/api/respond") {
      received = env;
      return { status: 200, body: { status: "ok" } };
    }
    return { value: {} };
  });

  try {
    const result = await dispatch(
      "dsh_decide_approval",
      { approval_id: "a9", outcome: "rejected" },
      { monitor },
    );
    assert.equal(received.type, "client-response");
    assert.equal(received.rpcId, "rpc-9");
    assert.equal(received.result.ok, true);
    assert.equal(received.result.value.outcome, "rejected");
    assert.equal(result.request.payload.approvalId, "a9");
  } finally {
    server.close();
  }
});

test("decide_approval resolves (removes) the approval on approval/resolved", async () => {
  const monitor = new FakeMonitor();
  monitor.recordApproval("rpc-9", {
    type: "approval/requested",
    approvalId: "a9",
    sessionId: "s9",
    tool: "bash",
  });
  monitor._record({ rpcId: "x", payload: { type: "approval/resolved", approvalId: "a9" } });
  assert.equal(monitor.snapshot().length, 0);
});
