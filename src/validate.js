// Path and project-name validation, plus bounded value compaction shared by
// the history/compact tool paths.

import fs from "node:fs";
import path from "node:path";

// One non-empty directory that already exists and resolves absolutely.
export function requireAbsoluteDir(value, label = "path") {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return path.resolve(value.trim());
}

export function requireExistingDir(value, label = "path") {
  const resolved = requireAbsoluteDir(value, label);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new TypeError(`${label} does not exist: ${resolved}`);
  }
  if (!stat.isDirectory()) throw new TypeError(`${label} is not a directory: ${resolved}`);
  return resolved;
}

// Project name: a single non-empty path segment with no path separators.
export function validateProjectName(name) {
  if (typeof name !== "string") throw new TypeError("name must be a string");
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new TypeError("name must be one non-empty path segment");
  }
  if (/[/\\]/.test(trimmed)) {
    throw new TypeError("name must be one non-empty path segment (no separators)");
  }
  return trimmed;
}

const STRING_LIMIT = 12000;

// Bound nested strings/lists/dicts for safety when echoing history.
export function bounded(value) {
  if (typeof value === "string") {
    return value.length <= STRING_LIMIT ? value : `${value.slice(0, STRING_LIMIT)}…[truncated]`;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => bounded(item));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "sourceEventSeqs") continue;
      out[key] = bounded(item);
    }
    return out;
  }
  return value;
}
