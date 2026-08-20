import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { mediaAssets, processingJobs } from "@/db/schema";

export async function getMediaJobState(id: string) {
  const db = getDb();
  if (!db) throw new Error("Database not configured.");
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) return null;
  const [job] = await db.select().from(processingJobs)
    .where(eq(processingJobs.mediaAssetId, id))
    .orderBy(desc(processingJobs.createdAt))
    .limit(1);
  return { asset, job };
}

export async function queueVideoProcessing(id: string) {
  const db = getDb();
  if (!db) throw new Error("Database not configured.");
  const state = await getMediaJobState(id);
  if (!state) throw new Error("Media not found.");
  const { asset } = state;
  if (asset.kind !== "video") throw new Error("Media is not a video.");
  if (asset.processingStatus === "ready" && state.job?.status === "completed") {
    return { processing: false, processingStatus: "ready", jobId: state.job.id };
  }

  const workerUrl = process.env.VIDEO_WORKER_URL?.replace(/\/$/, "");
  const workerSecret = process.env.VIDEO_WORKER_SECRET;
  if (!workerUrl || !workerSecret) {
    await db.update(mediaAssets).set({ processingStatus: "uploaded_unprocessed" }).where(eq(mediaAssets.id, id));
    throw new Error("Video worker URL/secret is not configured.");
  }

  let job = state.job;
  if (!job || !["queued", "processing"].includes(job.status)) {
    [job] = await db.insert(processingJobs).values({
      mediaAssetId: asset.id,
      physicalCardId: asset.physicalCardId,
      kind: "video_frame_extraction",
      status: "queued",
    }).returning();
  } else if (job.status !== "queued") {
    [job] = await db.update(processingJobs)
      .set({ status: "queued", error: null, updatedAt: new Date() })
      .where(eq(processingJobs.id, job.id))
      .returning();
  }
  if (!job) throw new Error("Could not create a video processing job.");
  await db.update(mediaAssets).set({ processingStatus: "queued" }).where(eq(mediaAssets.id, id));

  let warning: string | undefined;
  try {
    const worker = await fetch(`${workerUrl}/process`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({
        jobId: job.id,
        mediaAssetId: asset.id,
        physicalCardId: asset.physicalCardId,
        storagePath: asset.storagePath,
        captureType: asset.captureType,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!worker.ok) warning = `Worker dispatch returned HTTP ${worker.status}: ${(await worker.text()).slice(0, 500)}`;
  } catch (error) {
    warning = error instanceof Error ? error.message : "Worker dispatch failed";
  }
  return { processing: true, processingStatus: "queued", jobId: job.id, warning };
}
