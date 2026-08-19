import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { z } from "zod";
import { CardVaultOAuthProvider, installApprovalRoutes } from "./oauth.js";

const WEB = (process.env.APP_INTERNAL_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const INTERNAL_TOKEN = process.env.MCP_INTERNAL_TOKEN || "";
const AUTH_MODE = process.env.MCP_AUTH_MODE || (process.env.NODE_ENV === "production" ? "oauth" : "none");
const PUBLIC_URL = new URL(process.env.MCP_PUBLIC_URL || "http://localhost:3001");
const RESOURCE_URL = new URL("/mcp", PUBLIC_URL);
const BIND_HOST = AUTH_MODE === "oauth" ? "0.0.0.0" : "127.0.0.1";
const ALLOWED_HOSTS = [...new Set([
  PUBLIC_URL.hostname,
  "localhost",
  "127.0.0.1",
  process.env.RAILWAY_PRIVATE_DOMAIN,
  ...(process.env.MCP_ALLOWED_HOSTS || "").split(",").map((host) => host.trim()),
].filter((host): host is string => Boolean(host)))];
const READ_SCOPE = "cardvault:read";
const WRITE_SCOPE = "cardvault:write";
const gradeKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;

if (!['oauth', 'none'].includes(AUTH_MODE)) throw new Error("MCP_AUTH_MODE must be oauth or none.");
if (process.env.NODE_ENV === "production" && AUTH_MODE !== "oauth") throw new Error("Production MCP must use MCP_AUTH_MODE=oauth.");
if (process.env.NODE_ENV === "production" && (!INTERNAL_TOKEN || WEB === "http://localhost:3000")) throw new Error("Production MCP requires APP_INTERNAL_BASE_URL and MCP_INTERNAL_TOKEN.");

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${WEB}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(INTERNAL_TOKEN ? { authorization: `Bearer ${INTERNAL_TOKEN}` } : {}),
      ...(init.headers || {}),
    },
    signal: init.signal || AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`CardVault web API returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<Record<string, any>>;
}

async function imageContent(url: string, mimeType = "image/jpeg") {
  if (!mimeType.startsWith("image/")) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return null;
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > 15 * 1024 * 1024) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 15 * 1024 * 1024) return null;
  return { type: "image" as const, data: bytes.toString("base64"), mimeType };
}

const cardIdInput = { cardId: z.uuid().describe("Permanent physical_cards UUID; never use printing identity here") };
const probability = z.number().min(0).max(1).nullable().optional();
const probabilityShape = Object.fromEntries(gradeKeys.map((grade) => [grade, probability])) as Record<(typeof gradeKeys)[number], typeof probability>;
const optionalMoney = z.number().nonnegative().nullable().optional();
const valueShape = Object.fromEntries(gradeKeys.map((grade) => [grade, optionalMoney])) as Record<(typeof gradeKeys)[number], typeof optionalMoney>;
const sourceSchema = z.object({
  source: z.string().min(1),
  method: z.enum(["psa_recent_sales_median", "psa_estimate", "pricecharting_fallback", "tcgplayer_raw", "pricecharting_raw", "other"]),
  url: z.url().nullable().optional(),
  checkedAt: z.iso.datetime({ offset: true }),
  saleCount: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});
const sourceValue = sourceSchema.nullable().optional();
const sourceShape = {
  "1": sourceValue, "2": sourceValue, "3": sourceValue, "4": sourceValue, "5": sourceValue,
  "6": sourceValue, "7": sourceValue, "8": sourceValue, "9": sourceValue, "10": sourceValue,
};
const defectSchema = z.object({
  side: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  severity: z.string().nullable().optional(),
  description: z.string().min(1),
  mediaAssetId: z.uuid().nullable().optional(),
  extractedFrameId: z.uuid().nullable().optional(),
});

function mediaPriority(media: any) {
  const type = String(media.captureType || "");
  const order = ["front", "back", "centering", "front_surface", "back_surface", "top_edge", "bottom_edge", "left_edge", "right_edge", "corner_macro", "defect_macro", "other"];
  const exact = order.indexOf(type.replace(/_frame$/, ""));
  return exact < 0 ? 999 : exact;
}

async function gradingMediaContent(media: any[], selectedOnly: boolean, maxImages: number) {
  const eligible = media
    .filter((item) => (!selectedOnly || item.selectedForGrading) && item.signedUrl && String(item.mimeType || "image/jpeg").startsWith("image/"))
    .sort((left, right) => mediaPriority(left) - mediaPriority(right))
    .slice(0, maxImages);
  const content: Array<Record<string, unknown>> = [];
  for (const item of eligible) {
    content.push({ type: "text", text: `Media ${item.id}: ${item.captureType}${item.timestampMs != null ? ` @ ${item.timestampMs}ms` : ""}` });
    const image = await imageContent(item.signedUrl, item.mimeType || "image/jpeg");
    if (image) content.push(image);
  }
  return content;
}

function getServer() {
  const server = new McpServer(
    { name: "cardvault", version: "1.0.0" },
    {
      instructions:
        "CardVault stores data; ChatGPT performs grading. Never merge physical copies. Grade defect-first and assess centering, corners, edges, and surface independently. Use supplied centering measurements. Every re-grade creates a new grading run. For graded values use PSA exact-card/exact-variant/exact-grade recent sales median only with 3+ usable sales, then PSA Estimate, then PriceCharting fallback. Raw pricing uses TCGplayer then PriceCharting. Save the grade before its valuation; CardVault computes expected value from every nonzero PSA 1-10 probability, including PSA 5 and 6.",
    },
  );

  server.registerTool("list_ready_for_grading", {
    title: "List cards ready for grading",
    description: "List exact physical card copies marked Ready for Grading. Use the returned UUIDs to organize a ChatGPT grading batch.",
    inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ limit }) => {
    const result = await api("/api/internal/mcp/ready");
    const cards = (result.cards || []).slice(0, limit);
    return { structuredContent: { cards }, content: [{ type: "text", text: `Found ${cards.length} physical cards ready for grading.` }] };
  });

  server.registerTool("get_card", {
    title: "Get physical card",
    description: "Get the identity, prices, status, latest grade, and valuation for one permanent physical card UUID.",
    inputSchema: cardIdInput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ cardId }) => {
    const result = await api(`/api/internal/mcp/cards/${encodeURIComponent(cardId)}`);
    const card = { ...result.card, media: undefined };
    return { structuredContent: { card }, content: [{ type: "text", text: JSON.stringify(card, null, 2) }] };
  });

  server.registerTool("get_card_for_grading", {
    title: "Get coherent grading package",
    description: "Retrieve one exact physical card with identity, raw price, centering, selected media/frames, and prior grading history in one call.",
    inputSchema: { ...cardIdInput, includeImages: z.boolean().default(true), maxImages: z.number().int().min(1).max(20).default(15) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ cardId, includeImages, maxImages }) => {
    const result = await api(`/api/internal/mcp/cards/${encodeURIComponent(cardId)}`);
    const card = result.card;
    const selectedMedia = (card.media || []).filter((item: any) => item.selectedForGrading).sort((a: any, b: any) => mediaPriority(a) - mediaPriority(b));
    const gradingPackage = { ...card, media: selectedMedia };
    const content: any[] = [{ type: "text", text: JSON.stringify({ ...gradingPackage, media: selectedMedia.map(({ signedUrl, ...item }: any) => item) }, null, 2) }];
    if (includeImages) content.push(...await gradingMediaContent(selectedMedia, true, maxImages));
    return { structuredContent: { card: gradingPackage }, content };
  });

  server.registerTool("get_card_media", {
    title: "Get card media",
    description: "List original media and extracted frames for one physical card, optionally returning image content for deeper inspection.",
    inputSchema: { ...cardIdInput, selectedOnly: z.boolean().default(false), includeImages: z.boolean().default(false), maxImages: z.number().int().min(1).max(20).default(15) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ cardId, selectedOnly, includeImages, maxImages }) => {
    const result = await api(`/api/internal/mcp/cards/${encodeURIComponent(cardId)}/media`);
    const media = (result.media || []).filter((item: any) => !selectedOnly || item.selectedForGrading);
    const metadata = media.map(({ signedUrl, ...item }: any) => item);
    const content: any[] = [{ type: "text", text: JSON.stringify(metadata, null, 2) }];
    if (includeImages) content.push(...await gradingMediaContent(media, selectedOnly, maxImages));
    return { structuredContent: { media }, content };
  });

  server.registerTool("get_grading_history", {
    title: "Get grading history",
    description: "Return every immutable grading run and its defects for one physical card, newest first.",
    inputSchema: cardIdInput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ cardId }) => {
    const result = await api(`/api/internal/mcp/cards/${encodeURIComponent(cardId)}/grading-history`);
    return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result.gradingHistory, null, 2) }] };
  });

  server.registerTool("get_valuation_history", {
    title: "Get valuation history",
    description: "Return all timestamped raw/PSA valuations and source metadata for one physical card, newest first.",
    inputSchema: cardIdInput,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ cardId }) => {
    const result = await api(`/api/internal/mcp/cards/${encodeURIComponent(cardId)}/valuation-history`);
    return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result.valuationHistory, null, 2) }] };
  });

  server.registerTool("list_submission_candidates", {
    title: "List PSA submission candidates",
    description: "List recommended physical cards with positive gross grading EV. Gross EV is not net profit and excludes fees, shipping, insurance, selling fees, and taxes.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(30) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ limit }) => {
    const result = await api("/api/internal/mcp/submission-candidates");
    const cards = (result.cards || []).slice(0, limit);
    return { structuredContent: { cards }, content: [{ type: "text", text: `Found ${cards.length} positive-gross-EV submission candidates.` }] };
  });

  server.registerTool("save_grade", {
    title: "Save a new grading run",
    description: "Append a completed defect-first PSA pre-grade to one exact physical card. This never overwrites prior grading runs.",
    inputSchema: {
      ...cardIdInput,
      rubricVersion: z.string().default("psa-strict-v1"),
      centering: z.object({ grade: z.string(), notes: z.string().default("") }),
      corners: z.object({ grade: z.string(), notes: z.string().default("") }),
      edges: z.object({ grade: z.string(), notes: z.string().default("") }),
      surface: z.object({ grade: z.string(), notes: z.string().default("") }),
      centeringMeasurements: z.object({ frontLeft: z.number().nullable().optional(), frontRight: z.number().nullable().optional(), frontTop: z.number().nullable().optional(), frontBottom: z.number().nullable().optional(), backLeft: z.number().nullable().optional(), backRight: z.number().nullable().optional(), backTop: z.number().nullable().optional(), backBottom: z.number().nullable().optional() }).nullable().optional(),
      likelyGrade: z.number().min(1).max(10),
      likelyGradeLabel: z.string(),
      probabilities: z.object(probabilityShape),
      confidence: z.number().min(0).max(1).nullable().optional(),
      decision: z.enum(["grade", "conditional", "hold", "recheck", "do_not_grade"]),
      notes: z.string().default(""),
      defects: z.array(defectSchema).default([]),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ cardId, ...grade }) => {
    const result = await api(`/api/internal/mcp/cards/${encodeURIComponent(cardId)}/grade`, { method: "POST", body: JSON.stringify({ ...grade, sourceContext: { workflow: "chatgpt-mcp" } }) });
    return { structuredContent: result, content: [{ type: "text", text: `Appended grading run ${result.gradingRunId} for physical card ${cardId}.` }] };
  });

  server.registerTool("save_valuation", {
    title: "Save researched valuation",
    description: "Save exact-variant raw and PSA grade values with source evidence. CardVault calculates expected graded value and gross EV from the grading run probabilities; do not supply or estimate the formula result yourself.",
    inputSchema: {
      ...cardIdInput,
      gradingRunId: z.uuid().nullable().optional(),
      rawLow: optionalMoney,
      rawHigh: optionalMoney,
      rawMid: optionalMoney,
      rawSources: z.array(sourceSchema).default([]),
      values: z.object(valueShape),
      sources: z.object(sourceShape),
      notes: z.string().default(""),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ cardId, ...valuation }) => {
    const result = await api(`/api/internal/mcp/cards/${encodeURIComponent(cardId)}/valuation`, { method: "POST", body: JSON.stringify(valuation) });
    return { structuredContent: result, content: [{ type: "text", text: `Saved valuation ${result.valuationId}; expected slab ${result.expectedGradedValue}, gross uplift ${result.grossEvUplift}.` }] };
  });

  server.registerTool("update_card_status", {
    title: "Update grading workflow status",
    description: "Move one exact physical card through the CardVault grading/PSA workflow.",
    inputSchema: { ...cardIdInput, status: z.enum(["ungraded", "needs_photos", "ready_for_grading", "grading", "needs_more_photos", "graded", "recheck", "grade_candidate", "do_not_grade", "submitted_to_psa", "psa_returned"]) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ cardId, status }) => {
    const result = await api(`/api/internal/mcp/cards/${encodeURIComponent(cardId)}/status`, { method: "POST", body: JSON.stringify({ status }) });
    return { structuredContent: result, content: [{ type: "text", text: `Updated physical card ${cardId} to ${status}.` }] };
  });

  server.registerTool("save_defects", {
    title: "Append defects to a grading run",
    description: "Add defect evidence to the specified or latest grading run for one physical card without replacing existing defects or history.",
    inputSchema: { ...cardIdInput, gradingRunId: z.uuid().nullable().optional(), defects: z.array(defectSchema).min(1).max(100) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ cardId, ...payload }) => {
    const result = await api(`/api/internal/mcp/cards/${encodeURIComponent(cardId)}/defects`, { method: "POST", body: JSON.stringify(payload) });
    return { structuredContent: result, content: [{ type: "text", text: `Added ${result.defectIds.length} defects to grading run ${result.gradingRunId}.` }] };
  });

  server.registerTool("mark_media_for_grading", {
    title: "Include or exclude grading media",
    description: "Select an image/extracted frame for ChatGPT grading, or exclude it. Original videos cannot be selected; choose their retained frames.",
    inputSchema: { ...cardIdInput, mediaId: z.uuid(), selected: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ cardId, mediaId, selected }) => {
    const result = await api(`/api/internal/mcp/cards/${encodeURIComponent(cardId)}/media/${encodeURIComponent(mediaId)}/selection`, { method: "POST", body: JSON.stringify({ selected }) });
    return { structuredContent: result, content: [{ type: "text", text: `${selected ? "Included" : "Excluded"} media ${mediaId} for physical card ${cardId}.` }] };
  });

  return server;
}

const app = createMcpExpressApp({ host: BIND_HOST, allowedHosts: ALLOWED_HOSTS });
let oauthProvider: CardVaultOAuthProvider | null = null;
if (AUTH_MODE === "oauth") {
  const secret = process.env.MCP_OAUTH_SECRET || "";
  const password = process.env.MCP_OAUTH_PASSWORD || "";
  if (secret.length < 32 || password.length < 12) throw new Error("OAuth mode requires MCP_OAUTH_SECRET (32+ chars) and MCP_OAUTH_PASSWORD (12+ chars).");
  oauthProvider = new CardVaultOAuthProvider(secret, password, PUBLIC_URL, RESOURCE_URL);
  installApprovalRoutes(app, oauthProvider);
  app.use(mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: PUBLIC_URL,
    baseUrl: PUBLIC_URL,
    resourceServerUrl: RESOURCE_URL,
    scopesSupported: [READ_SCOPE, WRITE_SCOPE],
    resourceName: "CardVault private Pokémon collection",
    serviceDocumentationUrl: new URL("/mcp-info", PUBLIC_URL),
    clientRegistrationOptions: { clientIdGeneration: false, clientSecretExpirySeconds: 0 },
  }));
}

app.get("/health", (_request, response) => response.json({
  ok: true,
  service: "cardvault-mcp",
  authMode: AUTH_MODE,
  webApi: WEB,
  internalAuthConfigured: Boolean(INTERNAL_TOKEN),
}));
app.get("/mcp-info", (_request, response) => response.type("text").send("CardVault MCP: private collection read/write tools for ChatGPT. Connect to /mcp using OAuth."));

if (oauthProvider) {
  app.use("/mcp", requireBearerAuth({
    verifier: oauthProvider,
    requiredScopes: [READ_SCOPE, WRITE_SCOPE],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(RESOURCE_URL),
  }));
}

app.post("/mcp", async (request, response) => {
  const server = getServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
    response.on("close", () => { void transport.close(); void server.close(); });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
  }
});
app.get("/mcp", (_request, response) => response.status(405).set("Allow", "POST").json({ error: "Use POST for this stateless Streamable HTTP endpoint." }));
app.delete("/mcp", (_request, response) => response.status(405).set("Allow", "POST").json({ error: "This stateless endpoint has no session to delete." }));

const port = Number(process.env.PORT || 3001);
app.listen(port, BIND_HOST, () => console.log(`CardVault MCP listening on ${BIND_HOST}:${port} with ${AUTH_MODE} auth`));
