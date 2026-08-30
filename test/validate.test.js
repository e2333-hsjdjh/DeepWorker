// Configuration and validation unit tests (no network).

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { validateProjectName, requireExistingDir, bounded } from "../src/validate.js";

test("validateProjectName rejects empty", () => {
  assert.throws(() => validateProjectName("   "), /non-empty path segment/);
  assert.throws(() => validateProjectName("."), /non-empty path segment/);
  assert.throws(() => validateProjectName(".."), /non-empty path segment/);
});

test("validateProjectName rejects path separators and traversal", () => {
  assert.throws(() => validateProjectName("a/b"), /separators/);
  assert.throws(() => validateProjectName("a\\b"), /separators/);
  assert.throws(() => validateProjectName("../etc"), /separators/);
});

test("validateProjectName trims and accepts a plain segment", () => {
  assert.equal(validateProjectName("  my-project  "), "my-project");
  assert.equal(validateProjectName("my-project"), "my-project");
});

test("validateProjectName rejects non-string", () => {
  assert.throws(() => validateProjectName(42), /must be a string/);
});

test("requireExistingDir rejects nonexistent path", () => {
  assert.throws(() => requireExistingDir("/definitely/not/here-xyz"), /does not exist/);
});

test("requireExistingDir accepts an existing directory", () => {
  const dir = requireExistingDir(process.cwd());
  // Workspace cwd may be renamed (e.g. DeepWorker); only require a resolved
  // absolute-ish path with at least one segment.
  assert.ok(path.isAbsolute(dir) && dir.length > 1);
});

test("bounded truncates long strings and drops sourceEventSeqs", () => {
  const long = "x".repeat(13000);
  const out = bounded({ a: long, sourceEventSeqs: [1, 2], b: [1, 2, 3] });
  assert.equal(out.a.length, 12000 + "…[truncated]".length);
  assert.ok(!("sourceEventSeqs" in out));
  assert.deepEqual(out.b, [1, 2, 3]);
});
