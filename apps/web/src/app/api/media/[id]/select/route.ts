import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { extractedFrames, mediaAssets } from "@/db/schema";
import { webAuthorized } from "@/lib/web-auth";

const bodySchema = z.object({ selected: z.boolean() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!webAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [asset] = await db.select({ id: mediaAssets.id, kind: mediaAssets.kind }).from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (asset) {
    if (asset.kind === "video" && parsed.data.selected) return NextResponse.json({ error: "Select retained video frames, not the original video." }, { status: 400 });
    await db.update(mediaAssets).set({ selectedForGrading: parsed.data.selected }).where(eq(mediaAssets.id, id));
    return NextResponse.json({ ok: true, type: "media_asset" });
  }

  const [frame] = await db.select({ id: extractedFrames.id }).from(extractedFrames).where(eq(extractedFrames.id, id)).limit(1);
  if (frame) {
    await db.update(extractedFrames).set({ selectedForGrading: parsed.data.selected }).where(eq(extractedFrames.id, id));
    return NextResponse.json({ ok: true, type: "extracted_frame" });
  }

  return NextResponse.json({ error: "Media not found." }, { status: 404 });
}
