// Lint shim: verify every shipped .js and .mjs file parses under node --check.
// No external lint dependency. Exits non-zero on the first failing file.
//
// Optionally run: node scripts/check.js

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["src", "bin", "scripts"];

const targets = [];
for (const dir of DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  const entries = fs.readdirSync(abs);
  for (const entry of entries) {
    if (entry.endsWith(".js")) targets.push(path.join(abs, entry));
  }
}

let failed = 0;
for (const file of targets) {
  const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (res.status !== 0) {
    failed += 1;
    process.stderr.write(`✘ ${path.relative(ROOT, file)}\n`);
    process.stderr.write((res.stderr || res.stdout || "").trim() + "\n");
  } else {
    process.stdout.write(`✔ ${path.relative(ROOT, file)}\n`);
  }
}

process.stdout.write(`\n${targets.length - failed}/${targets.length} files OK\n`);
process.exit(failed === 0 ? 0 : 1);
