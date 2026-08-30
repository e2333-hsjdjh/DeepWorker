#!/usr/bin/env node
// deepworker CLI entrypoint.
//
//   deepworker serve            run the MCP stdio server
//   deepworker doctor [--json]  local DSH health check
//   deepworker --help           usage
//   deepworker --version        version
//
// Unknown commands exit non-zero.
//
// --help / --version / doctor are loadable WITHOUT the `ws` runtime
// dependency; `serve` lazy-loads it so a missing install only fails when the
// server is actually started.

import { VERSION } from "../src/version.js";

const HELP = `deepworker — orchestrate DeepSeek Harness (DSH) from Codex over its local protocol

Usage:
  deepworker serve           Run the MCP server over stdio (JSON-RPC 2.0)
  deepworker doctor [--json] Check the local DSH Web/API/WebSocket
  deepworker --help          Show this help
  deepworker --version       Print the version

Environment:
  DEEPWORKER_HOST        DSH host (default 127.0.0.1)
  DEEPWORKER_PORT        DSH port (default 3080)
  DEEPWORKER_STATE_DIR   state dir for owned-process bookkeeping
`;

async function main(argv) {
  const cmd = argv[0];

  if (cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    return 0;
  }
  if (cmd === "--version" || cmd === "-V" || cmd === "-v") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (cmd === "serve") {
    if (argv.length > 1) {
      process.stderr.write(`error: unexpected arguments to serve: ${argv.slice(1).join(" ")}\n`);
      return 2;
    }
    // Lazy import so --help/--version/doctor don't require `ws`.
    const { serve } = await import("../src/server.js");
    await serve();
    return 0;
  }
  if (cmd === "doctor") {
    const wantJson = argv.length === 2 && argv[1] === "--json";
    if (argv.length > 1 && !wantJson) {
      process.stderr.write(`error: unknown doctor option: ${argv.slice(1).join(" ")}\n`);
      process.stderr.write(`usage: deepworker doctor [--json]\n`);
      return 2;
    }
    const { runDoctor } = await import("../src/doctor.js");
    const report = await runDoctor();
    if (wantJson) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatDoctor(report));
    }
    return report.ok ? 0 : 1;
  }

  process.stderr.write(`error: unknown command: ${cmd || "(none)"}\n`);
  process.stderr.write(HELP);
  return 2;
}

function formatDoctor(report) {
  const lines = [];
  lines.push(`deepworker v${report.version} doctor`);
  lines.push(`target: ${report.target.baseUrl}`);
  for (const [name, check] of Object.entries(report.checks)) {
    const mark = check.ok ? "✔" : "✘";
    lines.push(
      `  ${mark} ${name}: ${check.detail || check.url || ""}${check.error ? ` — ${check.error}` : ""}`,
    );
  }
  lines.push(`overall: ${report.ok ? "OK" : "DEGRADED"}`);
  return `${lines.join("\n")}\n`;
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
