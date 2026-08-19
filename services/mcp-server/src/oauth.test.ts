import assert from "node:assert/strict";
import test from "node:test";
import { CardVaultOAuthProvider } from "./oauth.js";

test("dynamically registered public clients survive in a stateless signed client id", async () => {
  const provider = new CardVaultOAuthProvider("s".repeat(32), "a-long-test-password", new URL("https://mcp.example/"), new URL("https://mcp.example/mcp"));
  const client = await provider.clientsStore.registerClient!({
    redirect_uris: ["https://chatgpt.com/callback"],
    token_endpoint_auth_method: "none",
  });
  const restored = await provider.clientsStore.getClient(client.client_id);
  assert.equal(restored?.client_id, client.client_id);
  assert.deepEqual(restored?.redirect_uris, ["https://chatgpt.com/callback"]);
});
