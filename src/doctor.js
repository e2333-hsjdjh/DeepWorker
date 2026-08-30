// doctor: local DSH health check. Read-only — never writes state, never
// starts or stops anything.

import net from "node:net";
import { host, port, baseUrl, wsUrl } from "./config.js";
import { VERSION } from "./version.js";

const HTTP = "http";
const WS = "ws";

async function checkApi() {
  const entry = { kind: "api", url: `${baseUrl()}/api/host.describe`, ok: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`${baseUrl()}/api/host.describe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: "doctor-probe", method: "host.describe", payload: {} }),
      signal: controller.signal,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON */
    }
    entry.httpStatus = res.status;
    if (res.status >= 200 && res.status < 300) {
      entry.ok = true;
      if (body && body.result) entry.responded = body.result.ok === true;
      entry.returnedRpcId = body && body.rpcId ? body.rpcId : null;
    }
  } catch (err) {
    entry.error = err.message || String(err);
  } finally {
    clearTimeout(timer);
  }
  return entry;
}

function checkWs(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const entry = { kind: "websocket", url: wsUrl(), ok: false };
    // Dynamic import keeps node:module graph lazy; ws is the only runtime dep.
    import("ws")
      .then(({ default: WebSocketFactory }) => {
        let settled = false;
        const finish = (patch) => {
          if (settled) return;
          settled = true;
          Object.assign(entry, patch);
          clearTimeout(timer);
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolve(entry);
        };
        const timer = setTimeout(() => finish({ error: "timeout" }), timeoutMs);
        let ws;
        try {
          ws = new WebSocketFactory(wsUrl(), { origin: baseUrl() });
        } catch (err) {
          finish({ error: err.message });
          return;
        }
        ws.on("open", () => finish({ ok: true, connected: true }));
        ws.on("error", (err) => finish({ error: err.message || String(err) }));
        ws.on("close", () => finish({ error: "closed before open" }));
      })
      .catch((err) => {
        entry.error = err.message || String(err);
        resolve(entry);
      });
  });
}

function checkPort() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: host(), port: port(), timeout: 1000 });
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
  });
}

export async function runDoctor() {
  const portOpen = await checkPort();
  let api = { ok: false, kind: "api", url: `${baseUrl()}/api/host.describe` };
  let ws = { ok: false, kind: "websocket", url: wsUrl() };
  if (portOpen) {
    [api, ws] = await Promise.all([checkApi(), checkWs()]);
  } else {
    api.error = "port not listening";
    ws.error = "port not listening";
  }
  return {
    tool: "deepworker",
    version: VERSION,
    target: { host: host(), port: port(), baseUrl: baseUrl(), wsUrl: wsUrl() },
    checks: {
      port: { kind: "port", ok: portOpen, detail: `tcp ${host()}:${port()}` },
      api,
      websocket: ws,
    },
    ok: Boolean(portOpen && api.ok && ws.ok),
  };
}
