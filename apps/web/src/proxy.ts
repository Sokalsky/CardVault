import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { webAuthConfigured, webAuthorized } from "@/lib/web-auth";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health" || request.nextUrl.pathname.startsWith("/api/internal/mcp/")) {
    return NextResponse.next();
  }
  if (!webAuthConfigured() && process.env.NODE_ENV === "production") {
    return new NextResponse("CardVault web authentication is not configured.", { status: 503 });
  }
  if (!webAuthorized(request)) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="CardVault", charset="UTF-8"' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
