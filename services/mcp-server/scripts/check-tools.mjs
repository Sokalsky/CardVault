import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const selfHosted = !process.argv[2];
const endpoint = new URL(process.argv[2] || "http://127.0.0.1:3031/mcp");
let server;
if (selfHosted) {
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  server = spawn(process.execPath, ["dist/index.js"], {
    cwd: packageRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: endpoint.port, MCP_AUTH_MODE: "none" },
  });
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(new URL("/health", endpoint));
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

try {
const client = new Client({ name: "cardvault-smoke-test", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(endpoint));
const result = await client.listTools();
const names = new Set(result.tools.map((tool) => tool.name));
const required = [
  "list_ready_for_grading", "get_card", "get_card_for_grading", "get_card_media",
  "get_grading_history", "get_valuation_history", "list_submission_candidates", "save_grade",
  "save_valuation", "update_card_status", "save_defects", "mark_media_for_grading",
];
for (const name of required) assert.ok(names.has(name), `Missing MCP tool ${name}`);
console.log(`validated ${result.tools.length} MCP tools: ${[...names].join(", ")}`);
await client.close();
} finally {
  if (server) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
}
