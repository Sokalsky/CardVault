// CardVault runs as a single-user personal site: browser sign-in is disabled.
// The API routes still call webAuthorized() so this stays the single switch —
// restore a real check here (and a middleware) if the site ever goes multi-user.
// The internal MCP endpoints are unaffected; they use their own bearer token
// via lib/internal-auth.

export function webAuthConfigured() {
  return true;
}

export function webAuthorized(_request?: Request) {
  void _request;
  return true;
}
