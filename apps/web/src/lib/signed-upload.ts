function decodeJsonSegment(segment: string): unknown {
  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function isCompactJws(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const segments = value.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment || !/^[A-Za-z0-9_-]+$/.test(segment))) return false;

  try {
    const header = decodeJsonSegment(segments[0]);
    const payload = decodeJsonSegment(segments[1]);
    if (!header || typeof header !== "object" || !("alg" in header) || typeof header.alg !== "string" || header.alg.toLowerCase() === "none") return false;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    if ("exp" in payload && (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000))) return false;
    return true;
  } catch {
    return false;
  }
}

export function requireSignedUploadJws(value: unknown): string {
  if (!isCompactJws(value)) {
    const credentialHint = typeof value === "string" && value.startsWith("sb_")
      ? " The server returned a publishable key instead of a signed upload JWS."
      : "";
    throw new Error(`Storage upload was rejected locally: the server did not return a valid compact JWS.${credentialHint} No Storage request was made.`);
  }
  return value;
}

export function signedTusHeaders(token: unknown, upsert: boolean) {
  return { "x-signature": requireSignedUploadJws(token), "x-upsert": String(upsert) };
}

export function signedStandardHeaders(upsert: boolean) {
  return { "x-upsert": String(upsert) };
}
