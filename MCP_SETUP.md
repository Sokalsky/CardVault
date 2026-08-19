# Connect CardVault to ChatGPT

CardVault exposes a remote MCP server over Streamable HTTP at:

```text
https://<your-cardvault-mcp-domain>/mcp
```

It uses OAuth 2.1 authorization-code flow with PKCE and dynamic client registration. The approval page requires `MCP_OAUTH_PASSWORD`; access tokens expire after one hour and refresh tokens after 30 days. The MCP service then talks to the private CardVault web API with `MCP_INTERNAL_TOKEN`. Do not expose that internal token to ChatGPT or a browser.

## Prerequisites

Verify these before connecting:

```text
GET https://<mcp-domain>/health
ok = true
authMode = oauth
internalAuthConfigured = true
```

The deployed service also needs `MCP_PUBLIC_URL=https://<mcp-domain>` and `MCP_ALLOWED_HOSTS=<mcp-domain>` (hostname only). The web service must be live, Supabase must be seeded, and the same `MCP_INTERNAL_TOKEN` must exist in both services.

## Add it in ChatGPT

According to OpenAI's current [ChatGPT Developer mode guide](https://developers.openai.com/api/docs/guides/developer-mode), Developer mode supports remote MCP apps with read and write tools and Streamable HTTP transport.

1. In ChatGPT on the web, open Settings → Security and login → Developer mode and enable it.
2. Open ChatGPT Plugins, select the `+` button, and create a developer-mode app.
3. Give it the name `CardVault` and enter `https://<mcp-domain>/mcp` as the MCP server URL.
4. Select OAuth authentication if ChatGPT asks. CardVault supports dynamic client registration, so there is no client ID to copy manually.
5. Complete the CardVault authorization page with the deployed `MCP_OAUTH_PASSWORD`.
6. Find CardVault under Drafts and refresh its tool list. It should discover exactly 12 tools.
7. Start a new chat, select Developer mode from the tools/Plus menu, and enable CardVault.

Write tools change collection data, so review ChatGPT's confirmation prompt before approval. A new `save_grade` call appends history; it does not replace an earlier run.

## Available tools

Read:

- `list_ready_for_grading`
- `get_card`
- `get_card_for_grading`
- `get_card_media`
- `get_grading_history`
- `get_valuation_history`
- `list_submission_candidates`

Write:

- `save_grade`
- `save_valuation`
- `update_card_status`
- `save_defects`
- `mark_media_for_grading`

`get_card_for_grading` returns one coherent physical-card package, including identity, copy, printing, prices, measurements, prioritized selected images/frames, and prior history. The maximum inline image count is 20; the default is 15. `get_card_media` can retrieve additional originals when a closer inspection is needed.

## Suggested first checks

```text
List my CardVault physical cards that are Ready for Grading. Return their permanent IDs, identity, copy labels, and selected-media counts. Do not grade yet.
```

```text
Retrieve <physical-card-uuid> for grading. Inspect the selected media defect-first. Assess centering, corners, edges, and surface independently, state any missing evidence, and ask before saving a grade.
```

```text
Research exact-card, exact-variant PSA values using PSA recent exact-grade sales first. Use a median only with at least three usable sales; otherwise use PSA Estimate, then PriceCharting fallback. Save URLs, checked dates, methods, sale counts, and notes. Do not use eBay. Save the valuation only after a grading run exists.
```

CardVault computes expected slab value on the server from all PSA 1–10 probabilities. ChatGPT should provide the distribution and evidence, not a caller-computed EV field.

## Local protocol verification

These tests do not require Supabase because they validate protocol/auth/tool discovery rather than invoking collection tools:

```powershell
npm --workspace services/mcp-server run build
node services/mcp-server/scripts/check-tools.mjs
node services/mcp-server/scripts/check-oauth.mjs
```

The OAuth check launches an isolated local service, performs dynamic registration, PKCE authorization, password approval, token exchange, and authenticated discovery of all 12 tools, then stops it.
