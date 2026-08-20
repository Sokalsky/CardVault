import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { mediaAssets } from "@/db/schema";
import { webAuthorized } from "@/lib/web-auth";
import { getMediaJobState, queueVideoProcessing } from "@/lib/video-jobs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!webAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const state = await getMediaJobState(id);
  if (!state) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  return NextResponse.json({
    processingStatus: state.asset.processingStatus,
    jobStatus: state.job?.status || null,
    error: state.job?.error || null,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!webAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const { id } = await params;
  const state = await getMediaJobState(id);
  if (!state) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  if (state.asset.kind !== "video") {
    await db.update(mediaAssets).set({ processingStatus: "ready" }).where(eq(mediaAssets.id, id));
    return NextResponse.json({ ok: true, processing: false, processingStatus: "ready" });
  }
  try {
    const result = await queueVideoProcessing(id);
    return NextResponse.json({ ok: true, ...result }, { status: result.processing ? 202 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Video processing could not be queued." }, { status: 503 });
  }
}
