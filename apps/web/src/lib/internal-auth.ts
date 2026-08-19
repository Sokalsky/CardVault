import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

export function internalAuthorized(request: NextRequest) {
  const expected = process.env.MCP_INTERNAL_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}
