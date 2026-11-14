// A PID can be reused after DSH exits. Verify the recorded start identity
// before trusting its startup log or sending a signal.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pidFile, port } from "./config.js";

export function processIdentity(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8", timeout: 1000, stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, LC_ALL: "C" },
    }).trim() || null;
  } catch {
    return null;
  }
}

export function ownedProcess() {
  try {
    const record = JSON.parse(readFileSync(pidFile(), "utf8"));
    if (!Number.isSafeInteger(record?.pid) || record.pid <= 0 || record.port !== port()
      || typeof record.identity !== "string" || record.identity !== processIdentity(record.pid)) return null;
    return record;
  } catch {
    return null;
  }
}
