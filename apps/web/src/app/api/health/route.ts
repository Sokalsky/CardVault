import { NextResponse } from "next/server";
import { webAuthConfigured } from "@/lib/web-auth";

export function GET() {
  const database = Boolean(process.env.DATABASE_URL);
  const storage = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const productionAuth = process.env.NODE_ENV !== "production" || webAuthConfigured();
  return NextResponse.json(
    {
      ok: productionAuth,
      service: "cardvault-web",
      configured: {
        database,
        storage,
        videoWorker: Boolean(process.env.VIDEO_WORKER_URL && process.env.VIDEO_WORKER_SECRET),
        mcpInternalAuth: Boolean(process.env.MCP_INTERNAL_TOKEN),
        webAuth: webAuthConfigured(),
      },
    },
    { status: productionAuth ? 200 : 503 },
  );
}
