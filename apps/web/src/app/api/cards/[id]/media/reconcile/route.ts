import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { mediaAssets, physicalCards } from "@/db/schema";
import { getSupabaseAdmin } from "@/lib/supabase";
import { queueVideoProcessing } from "@/lib/video-jobs";
import { webAuthorized } from "@/lib/web-auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!webAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const supabase = getSupabaseAdmin();
  if (!db || !supabase) return NextResponse.json({ error: "Database/storage not configured." }, { status: 503 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid physical card ID." }, { status: 400 });
  const [card] = await db.select({ id: physicalCards.id }).from(physicalCards).where(eq(physicalCards.id, id)).limit(1);
  if (!card) return NextResponse.json({ error: "Physical card not found." }, { status: 404 });

  const bucket = process.env.MEDIA_BUCKET || "grading-media";
  const assets = await db.select().from(mediaAssets).where(eq(mediaAssets.physicalCardId, id));
  const incomplete = assets.filter((asset) => asset.processingStatus !== "ready");
  let removed = 0;
  let recovered = 0;
  let queued = 0;
  const errors: string[] = [];

  for (const asset of incomplete) {
    const existence = await supabase.storage.from(bucket).exists(asset.storagePath);
    if (!existence.data) {
      // A manually requested reconciliation is the acknowledgement that an
      // incomplete placeholder with no object can be safely discarded.
      await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
      removed += 1;
      continue;
    }
    if (asset.kind !== "video") {
      await db.update(mediaAssets).set({ processingStatus: "ready" }).where(eq(mediaAssets.id, asset.id));
      recovered += 1;
      continue;
    }
    try {
      await queueVideoProcessing(asset.id);
      queued += 1;
    } catch (error) {
      errors.push(`${asset.originalFilename || asset.id}: ${error instanceof Error ? error.message : "could not queue"}`);
    }
  }

  return NextResponse.json({ ok: errors.length === 0, removed, recovered, queued, errors });
}
