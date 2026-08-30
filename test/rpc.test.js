// HTTP rpc contract: rpcId echo mismatch, result.ok failures, and — critically
// — the Content-Type header. Real DSH rejects requests without
// `content-type: application/json` with HTTP 415, so these tests fail closed
// if the header regression returns.

import test from "node:test";
import assert from "node:assert/strict";

import { post, respond, DshApiError } from "../src/rpc.js";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test("post sends content-type: application/json and returns result.value", async () => {
  let sent;
  const http = async (url, req) => {
    sent = { url, req, body: JSON.parse(req.body) };
    return jsonResponse({
      rpcId: sent.body.rpcId,
      result: { ok: true, value: { hello: "world" } },
    });
  };
  const value = await post("host.describe", {}, { http });
  assert.deepEqual(value, { hello: "world" });
  assert.equal(sent.body.type, "client-request");
  assert.equal(sent.body.method, "host.describe");
  assert.ok(sent.req.headers, "request must carry headers");
  assert.equal(
    sent.req.headers["content-type"],
    "application/json",
    "post must send content-type: application/json",
  );
});

test("respond sends content-type: application/json", async () => {
  let sent;
  const http = async (url, req) => {
    sent = { req, body: JSON.parse(req.body) };
    return jsonResponse({ status: "ok" });
  };
  await respond("rpc-1", { outcome: "allowed-once" }, { http });
  assert.equal(sent.body.type, "client-response");
  assert.equal(
    sent.req.headers["content-type"],
    "application/json",
    "respond must send content-type: application/json",
  );
});

// Simulate the observed production failure: DSH returns 415 when the
// Content-Type header is missing/wrong. A fetch implementation that omits the
// header is rejected here, guarding against a silent regression.
test("a mock that enforces content-type (415 otherwise) still succeeds", async () => {
  const http = async (_url, req) => {
    if (req.headers?.["content-type"] !== "application/json") {
      return jsonResponse({ error: "Unsupported Media Type" }, 415);
    }
    const body = JSON.parse(req.body);
    return jsonResponse({ rpcId: body.rpcId, result: { ok: true, value: { n: 1 } } });
  };
  const value = await post("session.list", {}, { http });
  assert.deepEqual(value, { n: 1 });
});

test("post surfaces the 415 as a clear HTTP error when header is wrong", async () => {
  // Recreate the regression: an http shim that ignores our header contract
  // and always replies 415 — post must not fake-green, it must throw.
  const http = async () => jsonResponse({ error: "Unsupported Media Type" }, 415);
  await assert.rejects(() => post("session.list", {}, { http }), /HTTP 415/);
});

test("post throws when rpcId does not match", async () => {
  const http = async () =>
    jsonResponse({ rpcId: "something-else", result: { ok: true, value: {} } });
  await assert.rejects(() => post("session.list", {}, { http }), (err) => {
    assert.ok(err instanceof DshApiError);
    assert.match(err.message, /mismatched rpcId/);
    return true;
  });
});

test("post throws when result.ok is false", async () => {
  const http = async (_url, req) => {
    const parsed = JSON.parse(req.body);
    return jsonResponse({
      rpcId: parsed.rpcId,
      result: { ok: false, error: { code: "E404", message: "missing" } },
    });
  };
  await assert.rejects(() => post("session.create", {}, { http }), (err) => {
    assert.ok(err instanceof DshApiError);
    assert.match(err.message, /E404: missing/);
    return true;
  });
});

test("post throws when the API is unreachable", async () => {
  const http = async () => {
    throw new Error("ECONNREFUSED");
  };
  await assert.rejects(() => post("session.list", {}, { http }), /unavailable/);
});
