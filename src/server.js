// Line-delimited JSON-RPC 2.0 server on stdio.
//
// - stdout carries protocol responses ONLY; diagnostics go to stderr.
// - stdin is read line by line (process.stdin is already a line reader once
//   started; we also handle a streamed fallback for non-TTY/file input).
// - Notifications (no "id") produce no response.

import { EventMonitor } from "./events.js";
import { dispatch } from "./tools.js";
import { TOOLS } from "./tools-schema.js";
import { VERSION } from "./version.js";

function info(message) {
  process.stderr.write(`[deepworker] ${message}\n`);
}

function makeResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    isError: false,
  };
}

function makeErrorResult(err) {
  const message = err && err.message ? err.message : String(err);
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

export function handleEnvelope(message, deps = {}) {
  const id = message.id;
  const method = message.method;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "deepworker", version: VERSION },
      },
    };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }

  if (method === "tools/call") {
    const params = message.params || {};
    const name = params.name || "";
    const args = params.arguments || {};
    return dispatch(name, args, deps)
      .then((value) => ({ jsonrpc: "2.0", id, result: makeResult(value) }))
      .catch((err) => ({ jsonrpc: "2.0", id, result: makeErrorResult(err) }));
  }

  // Unknown method → JSON-RPC "Method not found" (-32601).
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export async function serve(options = {}) {
  const monitor = options.monitor || new EventMonitor();
  const deps = { monitor };
  const onMessage = async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (err) {
      writeStdout({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: `Parse error: ${err.message}` },
      });
      return;
    }
    if (message.id == null) return;
    try {
      const out = await handleEnvelope(message, deps);
      writeStdout(out);
    } catch (err) {
      writeStdout({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32603, message: `Internal error: ${err.message}` },
      });
    }
  };

  info(`serving MCP over stdio (target ${process.env.DEEPWORKER_HOST || "127.0.0.1"}:${process.env.DEEPWORKER_PORT || "3080"})`);

  process.stdin.setEncoding("utf8");
  let buffer = "";
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      onMessage(line);
    }
  });
  process.stdin.on("end", () => {
    if (buffer.trim()) onMessage(buffer);
    monitor.close();
    process.exit(0);
  });
  process.stdin.resume();

  process.on("SIGINT", () => {
    monitor.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    monitor.close();
    process.exit(0);
  });

  return { monitor, deps };
}

function writeStdout(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

export { VERSION };
