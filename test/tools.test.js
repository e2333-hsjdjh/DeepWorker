// Tool dispatch against a local mock DSH HTTP server (loopback only, no
// internet). Verifies create_project validation, list_sessions, history
// compaction, send, and cancel end-to-end through the rpc contract.

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { dispatch } from "../src/tools.js";
import { post } from "../src/rpc.js";

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
      let envelope;
      try {
        envelope = JSON.parse(body);
      } catch {
        envelope = {};
      }
      const result = handler(envelope, req);
      res.writeHead(result.status || 200, { "content-type": "application/json" });
      res.end(JSON.stringify(result.body ?? { rpcId: envelope.rpcId, result: { ok: true, value: result.value ?? {} } }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      process.env.DEEPWORKER_HOST = "127.0.0.1";
      process.env.DEEPWORKER_PORT = String(port);
      resolve({ server, port });
    });
  });
}

test("create_project rejects a bad name without contacting the server", async () => {
  const { server } = await startMock(() => ({ value: {} }));
  try {
    await assert.rejects(
      () => dispatch("dsh_create_project", { parent: os.tmpdir(), name: "../evil" }),
      /separators/,
    );
  } finally {
    server.close();
  }
});

test("create_project flows host.createDirectory -> workspace.create -> session.create", async () => {
  const calls = [];
  const { server } = await startMock((env) => {
    const m = env.method;
    calls.push(m);
    if (m === "host.createDirectory") {
      return { value: { path: path.join(os.tmpdir(), "newproj") } };
    }
    if (m === "workspace.create") {
      return { value: { workspace: { workspaceId: "ws-1", path: "/tmp/newproj" } } };
    }
    if (m === "session.create") {
      return { value: { sessionId: "sess-1", workspaceId: "ws-1" } };
    }
    if (m === "session.rename") return { value: {} };
    return { value: {} };
  });
  try {
    const result = await dispatch("dsh_create_project", {
      parent: os.tmpdir(),
      name: "newproj",
      agent_preset: "standard",
      title: "My project",
    });
    assert.equal(result.projectPath, path.join(os.tmpdir(), "newproj"));
    assert.equal(result.session.sessionId, "sess-1");
    assert.deepEqual(calls, [
      "host.createDirectory",
      "workspace.create",
      "session.create",
      "session.rename",
    ]);
  } finally {
    server.close();
  }
});

test("list_sessions compacts sessions and lists workspaces", async () => {
  const { server } = await startMock((env) => {
    if (env.method === "workspace.list") {
      return { value: { items: [{ workspaceId: "ws-1", path: "/x", title: "X", sessionIds: ["s1"] }], archivedSessionIds: [] } };
    }
    if (env.method === "session.list") {
      return {
        value: {
          items: [
            {
              sessionId: "s1",
              running: true,
              blank: false,
              cwd: "/x",
              agentPreset: "standard",
              updatedAt: "2026-01-01",
              projections: { values: { title: "hello", goal: "do work" } },
            },
          ],
        },
      };
    }
    return { value: {} };
  });
  try {
    const result = await dispatch("dsh_list_sessions", {}, { monitor: fakeMonitor() });
    assert.equal(result.workspaces.length, 1);
    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].title, "hello");
    assert.equal(result.sessions[0].goal, "do work");
    assert.equal(result.sessions[0].running, true);
  } finally {
    server.close();
  }
});

test("send and cancel post the right method", async () => {
  const seen = [];
  const { server } = await startMock((env) => {
    seen.push({ method: env.method, payload: env.payload });
    return { value: { ok: true } };
  });
  try {
    await dispatch("dsh_send", { session_id: "s1", message: "hi", mode: "queue" }, { monitor: fakeMonitor() });
    await dispatch("dsh_cancel", { session_id: "s1" }, { monitor: fakeMonitor() });
    assert.equal(seen[0].method, "session.prompt");
    assert.deepEqual(seen[0].payload.content, [{ type: "text", text: "hi" }]);
    assert.equal(seen[1].method, "session.cancel");
  } finally {
    server.close();
  }
});

test("history compacts assistant and skips tool-sourced user messages", async () => {
  const { server } = await startMock((env) => {
    return {
      value: {
        events: [
          {
            event: {
              type: "user/message",
              seq: 1,
              data: { source: { kind: "assistant" }, content: [] },
            },
          },
          {
            event: {
              type: "assistant/message",
              seq: 2,
              data: { message: { content: [{ type: "text", text: "hello world" }] }, usage: { input: 1 } },
            },
          },
          {
            event: { type: "tool/bash", seq: 3, data: { command: "ls" } },
            view: { summary: "ran ls" },
          },
        ],
        hasMore: false,
      },
    };
  });
  try {
    const result = await dispatch("dsh_history", { session_id: "s1", max_messages: 30 });
    assert.equal(result.sessionId, "s1");
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].type, "assistant/message");
    assert.equal(result.events[1].type, "tool/bash");
  } finally {
    server.close();
  }
});

test("history compacts flat top-level persisted events (no .event wrapper)", async () => {
  const { server } = await startMock((env) => {
    return {
      value: {
        events: [
          {
            type: "user/message",
            seq: 1,
            data: { source: { kind: "user" }, content: [{ type: "text", text: "do it" }] },
          },
          {
            type: "assistant/message",
            seq: 2,
            data: { message: { content: [{ type: "text", text: "done" }] }, usage: { output: 9 } },
          },
          {
            type: "tool/call",
            seq: 3,
            data: { name: "bash", arguments: { command: "ls" } },
            view: { for: "call", view: { card: "bash" } },
          },
        ],
        hasMore: false,
      },
    };
  });
  try {
    const result = await dispatch("dsh_history", { session_id: "s1", max_messages: 30 });
    assert.equal(result.events.length, 3);
    assert.equal(result.events[0].type, "user/message");
    assert.equal(result.events[1].type, "assistant/message");
    assert.equal(result.events[1].content[0].text, "done");
    assert.equal(result.events[2].type, "tool/call");
    assert.equal(result.events[2].data.name, "bash");
  } finally {
    server.close();
  }
});

test("dsh_status reports api description and eventStream without 415", async () => {
  let describeCalled = false;
  const { server } = await startMock((env) => {
    if (env.method === "host.describe") {
      describeCalled = true;
      return { value: { name: "dsh", version: "x" } };
    }
    return { value: {} };
  });
  try {
    const monitor = fakeMonitor();
    monitor.status = () => ({ connected: true, lastError: null });
    const result = await dispatch("dsh_status", {}, { monitor });
    assert.equal(result.api.name, "dsh");
    assert.equal(result.eventStream.connected, true);
    assert.equal(result.eventStream.lastError, null);
    assert.equal(describeCalled, true);
  } finally {
    server.close();
  }
});

function fakeMonitor() {
  // Minimal monitor with no network; ensure() is a no-op.
  return {
    ensure() {},
    snapshot() {
      return [];
    },
    recent() {
      return [];
    },
    status() {
      return { connected: false, lastError: null };
    },
    close() {},
  };
}
