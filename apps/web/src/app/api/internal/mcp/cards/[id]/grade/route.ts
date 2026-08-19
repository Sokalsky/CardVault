import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { gradingDefects, gradingRuns, physicalCards } from "@/db/schema";
import { gradePayloadSchema } from "@/lib/grade-schema";
import { internalAuthorized } from "@/lib/internal-auth";

const s = (v?: number | null) => (v === null || v === undefined ? null : String(v));

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb(); if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id } = await params;
  const parsed = gradePayloadSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const p = parsed.data;

  const [card] = await db.select({ id: physicalCards.id }).from(physicalCards).where(eq(physicalCards.id, id)).limit(1);
  if (!card) return NextResponse.json({ error: "Physical card not found" }, { status: 404 });

  const result = await db.transaction(async (tx) => {
    const [run] = await tx.insert(gradingRuns).values({
      physicalCardId: id,
      grader: "chatgpt-subscription-mcp",
      rubricVersion: p.rubricVersion,
      centeringGrade: p.centering.grade,
      centeringNotes: p.centering.notes,
      cornersGrade: p.corners.grade,
      cornersNotes: p.corners.notes,
      edgesGrade: p.edges.grade,
      edgesNotes: p.edges.notes,
      surfaceGrade: p.surface.grade,
      surfaceNotes: p.surface.notes,
      likelyGrade: s(p.likelyGrade),
      likelyGradeLabel: p.likelyGradeLabel,
      probability1: s(p.probabilities["1"]), probability2: s(p.probabilities["2"]), probability3: s(p.probabilities["3"]), probability4: s(p.probabilities["4"]),
      probability5: s(p.probabilities["5"]), probability6: s(p.probabilities["6"]), probability7: s(p.probabilities["7"]),
      probability8: s(p.probabilities["8"]), probability9: s(p.probabilities["9"]), probability10: s(p.probabilities["10"]),
      frontCenteringLeft: s(p.centeringMeasurements?.frontLeft), frontCenteringRight: s(p.centeringMeasurements?.frontRight),
      frontCenteringTop: s(p.centeringMeasurements?.frontTop), frontCenteringBottom: s(p.centeringMeasurements?.frontBottom),
      backCenteringLeft: s(p.centeringMeasurements?.backLeft), backCenteringRight: s(p.centeringMeasurements?.backRight),
      backCenteringTop: s(p.centeringMeasurements?.backTop), backCenteringBottom: s(p.centeringMeasurements?.backBottom),
      confidence: s(p.confidence),
      decision: p.decision,
      notes: p.notes,
      sourceContext: p.sourceContext,
    }).returning({ id: gradingRuns.id });

    if (p.defects.length) {
      await tx.insert(gradingDefects).values(p.defects.map((d) => ({
        gradingRunId: run.id,
        physicalCardId: id,
        side: d.side,
        region: d.region,
        category: d.category,
        severity: d.severity,
        description: d.description,
        mediaAssetId: d.mediaAssetId,
        extractedFrameId: d.extractedFrameId,
      })));
    }

    await tx.update(physicalCards).set({
      gradingStatus: p.decision === "do_not_grade" ? "do_not_grade" : p.decision === "grade" ? "grade_candidate" : p.decision === "hold" || p.decision === "recheck" ? "recheck" : "graded",
      latestLikelyGrade: s(p.likelyGrade),
      latestGradeLabel: p.likelyGradeLabel,
      submissionDecision: p.decision,
      updatedAt: new Date(),
    }).where(eq(physicalCards.id, id));
    return run;
  });

  return NextResponse.json({ ok: true, gradingRunId: result.id });
}
