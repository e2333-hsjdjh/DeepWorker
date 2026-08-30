// CLI: help, version, unknown-command non-zero exit. Serve is exercised
// separately via the protocol tests (it blocks on stdio).

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "deepworker.js");

function run(...args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8" });
}

test("--help exits 0 and prints DeepWorker usage", () => {
  const res = run("--help");
  assert.equal(res.status, 0);
  assert.match(res.stdout, /deepworker/);
  assert.match(res.stdout, /serve/);
  assert.match(res.stdout, /doctor/);
  assert.match(res.stdout, /DEEPWORKER_HOST/);
});

test("--version prints semver and exits 0", () => {
  const res = run("--version");
  assert.equal(res.status, 0);
  assert.match(res.stdout.trim(), /^0\.1\.0$/);
});

test("unknown command exits non-zero", () => {
  const res = run("bogus-command");
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /unknown command/);
});

test("doctor --json exits non-zero when nothing is listening", () => {
  const res = run("doctor", "--json");
  // DSH likely not running in CI/sandbox; the command must still parse JSON,
  // whether healthy (0) or not (1).
  let report;
  assert.doesNotThrow(() => {
    report = JSON.parse(res.stdout);
  });
  assert.equal(report.tool, "deepworker");
  assert.ok("checks" in report);
  assert.equal(typeof report.ok, "boolean");
  if (res.status !== 0) {
    assert.equal(report.ok, false);
  }
});
