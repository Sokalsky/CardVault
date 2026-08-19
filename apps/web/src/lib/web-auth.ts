import { timingSafeEqual } from "node:crypto";

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function webAuthConfigured() {
  return Boolean(process.env.CARDVAULT_WEB_USERNAME && process.env.CARDVAULT_WEB_PASSWORD);
}

export function webAuthorized(request: Request) {
  const username = process.env.CARDVAULT_WEB_USERNAME;
  const password = process.env.CARDVAULT_WEB_PASSWORD;
  if (!username || !password) return process.env.NODE_ENV !== "production";

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return equal(decoded.slice(0, separator), username) && equal(decoded.slice(separator + 1), password);
  } catch {
    return false;
  }
}
