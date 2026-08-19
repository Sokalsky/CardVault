import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import express from "express";
import { rateLimit } from "express-rate-limit";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { AccessDeniedError, InvalidClientMetadataError, InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from "@modelcontextprotocol/sdk/shared/auth.js";

type SignedKind = "client" | "authorization-request" | "authorization-code" | "access" | "refresh";
type Claims = Record<string, unknown> & { kind: SignedKind; exp: number };

const now = () => Math.floor(Date.now() / 1000);
const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64url");

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

export class CardVaultOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  private readonly usedCodes = new Set<string>();
  private readonly revokedTokens = new Set<string>();

  constructor(
    private readonly secret: string,
    private readonly approvalPassword: string,
    private readonly publicUrl: URL,
    private readonly resourceUrl: URL,
  ) {
    this.clientsStore = {
      getClient: async (clientId) => {
        try {
          const claims = this.verifySigned(clientId, "client");
          return { ...(claims.metadata as OAuthClientInformationFull), client_id: clientId };
        } catch {
          return undefined;
        }
      },
      registerClient: async (client) => {
        if (client.token_endpoint_auth_method && client.token_endpoint_auth_method !== "none") {
          throw new InvalidClientMetadataError("CardVault accepts OAuth public clients with token_endpoint_auth_method=none.");
        }
        const issuedAt = now();
        const metadata = { ...client, token_endpoint_auth_method: "none", client_id_issued_at: issuedAt };
        const clientId = this.sign({ kind: "client", exp: issuedAt + 365 * 24 * 60 * 60, metadata });
        return { ...metadata, client_id: clientId } as OAuthClientInformationFull;
      },
    };
  }

  private sign(claims: Claims) {
    const body = b64(JSON.stringify(claims));
    const signature = createHmac("sha256", this.secret).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  private verifySigned(token: string, kind: SignedKind): Claims {
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra) throw new InvalidTokenError("Malformed token");
    const expected = createHmac("sha256", this.secret).update(body).digest("base64url");
    if (!safeEqual(signature, expected)) throw new InvalidTokenError("Invalid token signature");
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Claims;
    if (claims.kind !== kind || !Number.isFinite(claims.exp) || claims.exp <= now()) throw new InvalidTokenError("Expired or invalid token");
    return claims;
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, response: Response) {
    const requestedScopes = params.scopes?.length ? params.scopes : ["cardvault:read", "cardvault:write"];
    if (requestedScopes.some((scope) => !["cardvault:read", "cardvault:write"].includes(scope))) {
      throw new AccessDeniedError("Unsupported CardVault scope requested.");
    }
    const requestToken = this.sign({
      kind: "authorization-request",
      exp: now() + 10 * 60,
      clientId: client.client_id,
      clientName: client.client_name || "ChatGPT",
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: requestedScopes,
      resource: params.resource?.href || this.resourceUrl.href,
    });
    const approval = new URL("/oauth/approve", this.publicUrl);
    approval.searchParams.set("request", requestToken);
    response.redirect(302, approval.href);
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string) {
    const claims = this.verifySigned(authorizationCode, "authorization-code");
    if (claims.clientId !== client.client_id || this.usedCodes.has(String(claims.jti))) throw new InvalidGrantError("Invalid authorization code");
    return String(claims.codeChallenge);
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, redirectUri?: string, resource?: URL) {
    const claims = this.verifySigned(authorizationCode, "authorization-code");
    if (claims.clientId !== client.client_id || claims.redirectUri !== redirectUri || this.usedCodes.has(String(claims.jti))) {
      throw new InvalidGrantError("Invalid or already-used authorization code");
    }
    const requestedResource = resource?.href || this.resourceUrl.href;
    if (claims.resource !== requestedResource || requestedResource !== this.resourceUrl.href) throw new InvalidGrantError("Invalid MCP resource");
    this.usedCodes.add(String(claims.jti));
    return this.issueTokens(client.client_id, claims.scopes as string[], requestedResource);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[], resource?: URL) {
    const claims = this.verifySigned(refreshToken, "refresh");
    if (this.revokedTokens.has(refreshToken) || claims.clientId !== client.client_id) throw new InvalidGrantError("Invalid refresh token");
    const requestedResource = resource?.href || String(claims.resource);
    if (requestedResource !== claims.resource || requestedResource !== this.resourceUrl.href) throw new InvalidGrantError("Invalid MCP resource");
    const granted = claims.scopes as string[];
    const requested = scopes?.length ? scopes : granted;
    if (requested.some((scope) => !granted.includes(scope))) throw new InvalidGrantError("Refresh scope exceeds the original grant");
    return this.issueTokens(client.client_id, requested, requestedResource);
  }

  private issueTokens(clientId: string, scopes: string[], resource: string): OAuthTokens {
    const access = this.sign({ kind: "access", exp: now() + 60 * 60, clientId, scopes, resource, jti: randomUUID() });
    const refresh = this.sign({ kind: "refresh", exp: now() + 30 * 24 * 60 * 60, clientId, scopes, resource, jti: randomUUID() });
    return { access_token: access, token_type: "Bearer", expires_in: 3600, refresh_token: refresh, scope: scopes.join(" ") };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (this.revokedTokens.has(token)) throw new InvalidTokenError("Token revoked");
    const claims = this.verifySigned(token, "access");
    if (claims.resource !== this.resourceUrl.href) throw new InvalidTokenError("Token was issued for a different resource");
    return {
      token,
      clientId: String(claims.clientId),
      scopes: claims.scopes as string[],
      expiresAt: claims.exp,
      resource: new URL(String(claims.resource)),
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    this.revokedTokens.add(request.token);
  }

  approvalPage(requestToken: string) {
    const claims = this.verifySigned(requestToken, "authorization-request");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize CardVault</title><style>body{font:16px system-ui;background:#0b0d10;color:#f2f5f7;display:grid;place-items:center;min-height:100vh;margin:0}.box{width:min(92vw,460px);background:#11151a;border:1px solid #2a323c;border-radius:14px;padding:24px}input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:9px;margin-top:12px}input{background:#0b0d10;color:#fff;border:1px solid #3a444f}button{background:#e6c75a;border:0;font-weight:700}p{color:#aeb8c2;line-height:1.5}</style></head><body><form class="box" method="post"><h1>Authorize CardVault</h1><p><strong>${escapeHtml(String(claims.clientName))}</strong> is requesting read/write access to your private card collection through MCP.</p><input type="hidden" name="request" value="${escapeHtml(requestToken)}"><label>CardVault MCP password<input name="password" type="password" required autocomplete="current-password"></label><button type="submit">Authorize</button></form></body></html>`;
  }

  approve(requestToken: string, password: string) {
    if (!safeEqual(password, this.approvalPassword)) throw new AccessDeniedError("Incorrect CardVault MCP password");
    const request = this.verifySigned(requestToken, "authorization-request");
    const code = this.sign({ ...request, kind: "authorization-code", exp: now() + 5 * 60, jti: randomBytes(16).toString("hex") });
    const redirect = new URL(String(request.redirectUri));
    redirect.searchParams.set("code", code);
    if (request.state) redirect.searchParams.set("state", String(request.state));
    return redirect.href;
  }
}

export function installApprovalRoutes(app: Express, provider: CardVaultOAuthProvider) {
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.get("/oauth/approve", limiter, (request: Request, response: Response) => {
    try {
      response.setHeader("Cache-Control", "no-store");
      response.type("html").send(provider.approvalPage(String(request.query.request || "")));
    } catch {
      response.status(400).send("Invalid or expired authorization request.");
    }
  });
  app.post("/oauth/approve", limiter, express.urlencoded({ extended: false }), (request: Request, response: Response) => {
    try {
      response.setHeader("Cache-Control", "no-store");
      response.redirect(302, provider.approve(String(request.body.request || ""), String(request.body.password || "")));
    } catch {
      response.status(401).type("html").send("Authorization denied. Check the password and restart the connection flow.");
    }
  });
}
