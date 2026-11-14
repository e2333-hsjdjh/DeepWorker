// Lifecycle: owned-PID bookkeeping, external-process refusal, and web argv.
// No real DSH process is launched.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { stopWeb, webArgv, ownedPid, processAlive } from "../src/lifecycle.js";
import { stateDir } from "../src/config.js";

function tmpState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepworker-test-"));
  process.env.DEEPWORKER_STATE_DIR = dir;
  return dir;
}

test("webArgv only passes --no-open to capable runtimes and honors the port", t => {
  const previous = process.env.DEEPWORKER_PORT;
  t.after(() => {
    if (previous === undefined) delete process.env.DEEPWORKER_PORT;
    else process.env.DEEPWORKER_PORT = previous;
  });
  process.env.DEEPWORKER_PORT = "3080";
  assert.deepEqual(webArgv({ probe: () => false }), ["web"]);
  assert.deepEqual(webArgv({ probe: () => true }), ["web", "--no-open"]);
  process.env.DEEPWORKER_PORT = "31987";
  assert.deepEqual(webArgv({ probe: () => true }), ["web", "--no-open", "--port", "31987"]);
  process.env.DEEPWORKER_PORT = "31987x";
  assert.throws(() => webArgv({ probe: () => true }), /integer/);
});

test("stopWeb refuses when no owned PID is recorded", async () => {
  process.env.DEEPWORKER_PORT = "63999"; // unused port => not running
  const dir = tmpState();
  const result = await stopWeb();
  assert.equal(result.stopped, false);
  assert.match(result.reason, /refusing to stop an external process/i);
  assert.equal(result.managedByPlugin, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ownedPid returns null when pid file is absent or invalid", async () => {
  const dir = tmpState();
  assert.equal(await ownedPid(), null);
  fs.writeFileSync(path.join(dir, "web.pid"), "not-a-number");
  assert.equal(await ownedPid(), null);
  fs.writeFileSync(path.join(dir, "web.pid"), String(process.pid));
  assert.equal(await ownedPid(), null, "a live PID without process identity is not owned");
  fs.writeFileSync(path.join(dir, "web.pid"), JSON.stringify({
    pid: process.pid, identity: "stale start time", port: 63999,
  }));
  assert.equal(await ownedPid(), null, "a reused PID is not owned");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("processAlive returns false for a dead pid", async () => {
  // A pid that is almost certainly not running; only assert a boolean.
  const alive = await processAlive(99999999);
  assert.equal(typeof alive, "boolean");
  assert.equal(alive, false);
});

test("stateDir resolves under DEEPWORKER_STATE_DIR", () => {
  process.env.DEEPWORKER_STATE_DIR = "/tmp/custom-state";
  assert.equal(stateDir(), "/tmp/custom-state");
});
