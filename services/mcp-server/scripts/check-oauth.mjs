import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const selfHosted = !process.argv[2];
const base = new URL(process.argv[2] || "http://127.0.0.1:3032");
const password = process.argv[3] || randomBytes(24).toString("base64url");
const smokeCardId = process.argv[4];
let server;

if (selfHosted) {
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  server = spawn(process.execPath, ["dist/index.js"], {
    cwd: packageRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(base.port),
      MCP_AUTH_MODE: "oauth",
      MCP_PUBLIC_URL: base.origin,
      MCP_OAUTH_SECRET: randomBytes(48).toString("base64url"),
      MCP_OAUTH_PASSWORD: password,
    },
  });
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(new URL("/health", base));
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

try {
const redirectUri = "https://example.com/cardvault-oauth-test";
const resource = new URL("/mcp", base).href;
const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const expectStatus = async (response, expected) => {
  if (response.status !== expected) {
    assert.fail(`Expected HTTP ${expected}, received ${response.status}: ${await response.text()}`);
  }
};

const registration = await fetch(new URL("/register", base), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ redirect_uris: [redirectUri], token_endpoint_auth_method: "none", client_name: "CardVault OAuth smoke test" }),
});
await expectStatus(registration, 201);
const clientInfo = await registration.json();

const authorize = new URL("/authorize", base);
authorize.searchParams.set("response_type", "code");
authorize.searchParams.set("client_id", clientInfo.client_id);
authorize.searchParams.set("redirect_uri", redirectUri);
authorize.searchParams.set("code_challenge", challenge);
authorize.searchParams.set("code_challenge_method", "S256");
authorize.searchParams.set("scope", "cardvault:read cardvault:write");
authorize.searchParams.set("state", "cardvault-smoke-state");
authorize.searchParams.set("resource", resource);
const authorization = await fetch(authorize, { redirect: "manual" });
assert.equal(authorization.status, 302);
const approvalUrl = new URL(authorization.headers.get("location"));
const approvalPage = await fetch(approvalUrl);
assert.equal(approvalPage.status, 200);
assert.match(await approvalPage.text(), /Authorize CardVault/);

const approval = await fetch(approvalUrl, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ request: approvalUrl.searchParams.get("request"), password }),
});
await expectStatus(approval, 302);
const callback = new URL(approval.headers.get("location"));
assert.equal(callback.searchParams.get("state"), "cardvault-smoke-state");
const code = callback.searchParams.get("code");
assert.ok(code);

const tokenResponse = await fetch(new URL("/token", base), {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientInfo.client_id,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource,
  }),
});
await expectStatus(tokenResponse, 200);
const tokens = await tokenResponse.json();
assert.ok(tokens.access_token && tokens.refresh_token);

const client = new Client({ name: "cardvault-oauth-smoke", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(resource), { requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } } }));
const tools = await client.listTools();
assert.equal(tools.tools.length, 12);
const mediaTool = tools.tools.find((tool) => tool.name === "get_card_media");
assert.ok(mediaTool?.inputSchema?.properties?.imageOffset, "get_card_media must expose imageOffset pagination");
if (smokeCardId) {
  const result = await client.callTool({ name: "get_card_media", arguments: { cardId: smokeCardId, selectedOnly: false, includeImages: false, maxImages: 20, imageOffset: 0 } });
  const media = result.structuredContent?.media;
  assert.ok(Array.isArray(media), "get_card_media must return its complete structured media list");
  const grading = await client.callTool({ name: "get_card_for_grading", arguments: { cardId: smokeCardId, includeImages: false, maxImages: 20, imageOffset: 0 } });
  const selected = grading.structuredContent?.card?.media;
  assert.ok(Array.isArray(selected), "get_card_for_grading must return selected grading media");
  console.log(`validated ${media.length} media records and ${selected.length} selected grading records for ${smokeCardId}`);
}
await client.close();
console.log("validated OAuth discovery/DCR/PKCE/approval/token flow and authenticated MCP tool discovery");
} finally {
  if (server) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
}
