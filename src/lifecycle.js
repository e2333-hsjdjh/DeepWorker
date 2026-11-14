// Local DSH process lifecycle management.
//
// The controller only ever starts/stop a process it owns (tracked via a pid
// file inside the state dir). Starting runs `dsh web` by default; the
// `--no-open` flag is added ONLY when a help probe confirms this DSH build
// supports it, because some builds reject it as an unknown option. The
// controller never opens or drives a browser itself.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { host, port, stateDir, pidFile, logFile } from "./config.js";

export async function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === "EPERM";
  }
}

export async function ownedPid() {
  let text;
  try {
    text = fs.readFileSync(pidFile(), "utf8").trim();
  } catch {
    return null;
  }
  const pid = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(pid) || pid <= 0) {
    fs.rmSync(pidFile(), { force: true });
    return null;
  }
  if (await processAlive(pid)) return pid;
  fs.rmSync(pidFile(), { force: true });
  return null;
}

// Check whether something is listening on the configured host/port.
export function portOpen(timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: host(), port: port(), timeout: timeoutMs });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(timeoutMs);
  });
}

// Probe whether `dsh web --help` accepts `--no-open`. Non-zero exit or a
// missing flag means unsupported; anything else is treated conservatively
// as "do not rely on it".
export function supportsNoOpen(timeoutMs = 5000) {
  try {
    const res = spawnSync("dsh", ["web", "--help"], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = `${res.stdout || ""}\n${res.stderr || ""}`;
    return res.status === 0 && /--no-open/.test(out);
  } catch {
    return false;
  }
}

// Compute the argv used to start DSH web. Defaults to exactly ["web"].
export function webArgv({ probe = supportsNoOpen } = {}) {
  const argv = ["web"];
  if (probe()) argv.push("--no-open");
  if (port() !== 3080) argv.push("--port", String(port()));
  return argv;
}

export async function startWeb() {
  const before = await status();
  if (before.running) return { started: false, ...before };

  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  const argv = webArgv();
  const fd = fs.openSync(logFile(), "a", 0o600);
  const proc = spawn("dsh", argv, {
    stdio: ["ignore", fd, fd],
    detached: true,
  });
  fs.closeSync(fd);
  try {
    await new Promise((resolve, reject) => {
      proc.once("spawn", resolve);
      proc.once("error", reject);
    });
  } catch (error) {
    return { started: false, argv, error: `无法启动 DSH：${error.message}`, ...(await status()) };
  }
  proc.unref();

  fs.writeFileSync(pidFile(), String(proc.pid), { mode: 0o600 });
  const deadline = Date.now() + 20000;
  for (;;) {
    if (!(await processAlive(proc.pid))) break;
    if (await portOpen()) {
      return { started: true, argv, ...(await status()) };
    }
    if (Date.now() >= deadline) break;
    await sleep(250);
  }

  return {
    started: false,
    argv,
    error: "DSH did not become ready within 20 seconds",
    ...(await status()),
  };
}

export async function stopWeb() {
  const pid = await ownedPid();
  if (pid == null) {
    return {
      stopped: false,
      reason: "No controller-owned DSH process; refusing to stop an external process.",
      ...(await status()),
    };
  }

  // Terminate the whole process group we created (start_new_session/detached).
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }

  const deadline = Date.now() + 8000;
  while ((await processAlive(pid)) && Date.now() < deadline) {
    await sleep(200);
  }

  if (await processAlive(pid)) {
    return {
      stopped: false,
      reason: "SIGTERM timed out; refusing to force-kill.",
      ...(await status()),
    };
  }

  fs.rmSync(pidFile(), { force: true });
  return { stopped: true, ...(await status()) };
}

export async function status() {
  const pid = await ownedPid();
  const active = await portOpen();
  let description = null;
  let apiError = null;
  if (active) {
    try {
      const { post } = await import("./rpc.js");
      description = await post("host.describe", {});
    } catch (err) {
      apiError = err.message || String(err);
    }
  }
  return {
    running: active,
    managedByPlugin: pid != null,
    pid,
    url: `http://${host()}:${port()}`,
    api: description,
    apiError,
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { stateDir, pidFile, logFile, path };
