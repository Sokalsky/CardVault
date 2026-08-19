import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { extractedFrames, gradingDefects, gradingRuns, mediaAssets } from "@/db/schema";
import { defectSchema } from "@/lib/grade-schema";
import { internalAuthorized } from "@/lib/internal-auth";

const schema = z.object({ gradingRunId: z.uuid().optional().nullable(), defects: z.array(defectSchema).min(1).max(100) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid physical card ID" }, { status: 400 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const runs = parsed.data.gradingRunId
    ? await db.select({ id: gradingRuns.id }).from(gradingRuns).where(and(eq(gradingRuns.id, parsed.data.gradingRunId), eq(gradingRuns.physicalCardId, id))).limit(1)
    : await db.select({ id: gradingRuns.id }).from(gradingRuns).where(eq(gradingRuns.physicalCardId, id)).orderBy(desc(gradingRuns.createdAt)).limit(1);
  if (!runs[0]) return NextResponse.json({ error: "A grading run for this card is required." }, { status: 409 });

  for (const defect of parsed.data.defects) {
    if (defect.mediaAssetId) {
      const rows = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(eq(mediaAssets.id, defect.mediaAssetId), eq(mediaAssets.physicalCardId, id))).limit(1);
      if (!rows[0]) return NextResponse.json({ error: `Media ${defect.mediaAssetId} does not belong to this physical card.` }, { status: 400 });
    }
    if (defect.extractedFrameId) {
      const rows = await db.select({ id: extractedFrames.id }).from(extractedFrames).where(and(eq(extractedFrames.id, defect.extractedFrameId), eq(extractedFrames.physicalCardId, id))).limit(1);
      if (!rows[0]) return NextResponse.json({ error: `Frame ${defect.extractedFrameId} does not belong to this physical card.` }, { status: 400 });
    }
  }

  const inserted = await db.insert(gradingDefects).values(parsed.data.defects.map((defect) => ({
    gradingRunId: runs[0].id,
    physicalCardId: id,
    ...defect,
  }))).returning({ id: gradingDefects.id });
  return NextResponse.json({ ok: true, gradingRunId: runs[0].id, defectIds: inserted.map((row) => row.id) });
}
