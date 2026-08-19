import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { mediaAssets, processingJobs } from "@/db/schema";
import { webAuthorized } from "@/lib/web-auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!webAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const { id } = await params;
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) return NextResponse.json({ error: "Media not found." }, { status: 404 });

  const isVideo = asset.kind === "video";
  await db.update(mediaAssets).set({ processingStatus: isVideo ? "processing" : "ready" }).where(eq(mediaAssets.id, id));
  if (!isVideo) return NextResponse.json({ ok: true, processing: false });

  const workerUrl = process.env.VIDEO_WORKER_URL?.replace(/\/$/, "");
  if (!workerUrl) {
    await db.update(mediaAssets).set({ processingStatus: "uploaded_unprocessed" }).where(eq(mediaAssets.id, id));
    return NextResponse.json({ ok: true, processing: false, warning: "VIDEO_WORKER_URL is not configured." });
  }
  const workerSecret = process.env.VIDEO_WORKER_SECRET;
  if (!workerSecret) {
    await db.update(mediaAssets).set({ processingStatus: "uploaded_unprocessed" }).where(eq(mediaAssets.id, id));
    return NextResponse.json({ error: "VIDEO_WORKER_SECRET is not configured." }, { status: 503 });
  }

  const [job] = await db.insert(processingJobs).values({
    mediaAssetId: asset.id,
    physicalCardId: asset.physicalCardId,
    kind: "video_frame_extraction",
    status: "queued",
  }).returning({ id: processingJobs.id });

  try {
    const worker = await fetch(`${workerUrl}/process`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({ jobId: job.id, mediaAssetId: asset.id, physicalCardId: asset.physicalCardId, storagePath: asset.storagePath, captureType: asset.captureType }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!worker.ok) throw new Error(await worker.text());
    const result = await worker.json();
    return NextResponse.json({ ok: true, processing: false, result });
  } catch (error) {
    await db.update(mediaAssets).set({ processingStatus: "failed" }).where(eq(mediaAssets.id, id));
    await db.update(processingJobs).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 2000) : "Video processing failed", updatedAt: new Date() }).where(eq(processingJobs.id, job.id));
    return NextResponse.json({ error: error instanceof Error ? error.message : "Video processing failed." }, { status: 502 });
  }
}
