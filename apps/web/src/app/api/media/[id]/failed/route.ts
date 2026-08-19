import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { mediaAssets } from "@/db/schema";
import { webAuthorized } from "@/lib/web-auth";

const schema = z.object({
  stage: z.string().max(80).optional(),
  error: z.string().max(2000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!webAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const [asset] = await db.update(mediaAssets)
    .set({ processingStatus: "failed" })
    .where(eq(mediaAssets.id, id))
    .returning({ id: mediaAssets.id, physicalCardId: mediaAssets.physicalCardId, originalFilename: mediaAssets.originalFilename });
  if (!asset) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  console.error("Browser media upload failed", { ...asset, ...parsed.data });
  return NextResponse.json({ ok: true });
}
