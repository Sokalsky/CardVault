import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { extractedFrames, mediaAssets } from "@/db/schema";
import { internalAuthorized } from "@/lib/internal-auth";

const schema = z.object({ selected: z.boolean() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id, mediaId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(mediaId).success) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const asset = await db.select({ id: mediaAssets.id, kind: mediaAssets.kind }).from(mediaAssets).where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.physicalCardId, id))).limit(1);
  if (asset[0]) {
    if (asset[0].kind === "video") return NextResponse.json({ error: "Original videos cannot be selected as grading images; select extracted frames." }, { status: 400 });
    await db.update(mediaAssets).set({ selectedForGrading: parsed.data.selected }).where(eq(mediaAssets.id, mediaId));
    return NextResponse.json({ ok: true, type: "media_asset" });
  }
  const frame = await db.select({ id: extractedFrames.id }).from(extractedFrames).where(and(eq(extractedFrames.id, mediaId), eq(extractedFrames.physicalCardId, id))).limit(1);
  if (!frame[0]) return NextResponse.json({ error: "Media not found for this physical card." }, { status: 404 });
  await db.update(extractedFrames).set({ selectedForGrading: parsed.data.selected }).where(eq(extractedFrames.id, mediaId));
  return NextResponse.json({ ok: true, type: "extracted_frame" });
}
