// DeepWorker — runtime configuration resolved from environment.
//
// DeepWorker only ever talks to a local DSH protocol host. Override the
// host/port only with an explicit reason; the defaults keep everything pinned
// to 127.0.0.1:3080.

import os from "node:os";
import path from "node:path";

export function host() {
  return process.env.DEEPWORKER_HOST || "127.0.0.1";
}

export function port() {
  const raw = process.env.DEEPWORKER_PORT || "3080";
  const num = Number.parseInt(raw, 10);
  if (!Number.isInteger(num) || num < 1 || num > 65535) {
    throw new Error(`DEEPWORKER_PORT must be an integer in 1..65535, got: ${raw}`);
  }
  return num;
}

export function baseUrl() {
  return `http://${host()}:${port()}`;
}

export function wsUrl() {
  return `ws://${host()}:${port()}/api/events.mux`;
}

export function stateDir() {
  const raw = process.env.DEEPWORKER_STATE_DIR || path.join(os.homedir(), ".dsh", "deepworker");
  return path.resolve(raw);
}

export function pidFile() {
  return path.join(stateDir(), "web.pid");
}

export function logFile() {
  return path.join(stateDir(), "web.log");
}
