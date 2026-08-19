import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { gradingRuns, physicalCards, valuations } from "@/db/schema";
import { gradeKeys, valuationPayloadSchema } from "@/lib/grade-schema";
import { internalAuthorized } from "@/lib/internal-auth";
import { calculateExpectedGradedValue, calculateGrossEvUplift } from "@/lib/valuation";

const s = (value?: number | null) => (value == null ? null : String(value));

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id } = await params;
  const parsed = valuationPayloadSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const payload = parsed.data;

  const [card] = await db.select().from(physicalCards).where(eq(physicalCards.id, id)).limit(1);
  if (!card) return NextResponse.json({ error: "Physical card not found" }, { status: 404 });

  const runRows = payload.gradingRunId
    ? await db.select().from(gradingRuns).where(and(eq(gradingRuns.id, payload.gradingRunId), eq(gradingRuns.physicalCardId, id))).limit(1)
    : await db.select().from(gradingRuns).where(eq(gradingRuns.physicalCardId, id)).orderBy(desc(gradingRuns.createdAt)).limit(1);
  const run = runRows[0];
  if (!run) return NextResponse.json({ error: "A grading run is required before valuation." }, { status: 409 });

  const probabilities = {
    "1": Number(run.probability1 || 0), "2": Number(run.probability2 || 0), "3": Number(run.probability3 || 0), "4": Number(run.probability4 || 0),
    "5": Number(run.probability5 || 0), "6": Number(run.probability6 || 0), "7": Number(run.probability7 || 0), "8": Number(run.probability8 || 0),
    "9": Number(run.probability9 || 0), "10": Number(run.probability10 || 0),
  };
  const values = Object.fromEntries(gradeKeys.map((grade) => [grade, payload.values[grade]]));
  let expectedGradedValue: number;
  try {
    expectedGradedValue = calculateExpectedGradedValue(probabilities, values);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid valuation" }, { status: 400 });
  }
  const rawMid = payload.rawMid ?? Number(card.rawMid ?? 0);
  const grossEvUplift = calculateGrossEvUplift(expectedGradedValue, rawMid);
  const sourceDetails = {
    raw: payload.rawSources,
    grades: Object.fromEntries(gradeKeys.map((grade) => [grade, payload.sources[grade] ?? null])),
  };
  const checkedTimes = [...payload.rawSources, ...gradeKeys.map((grade) => payload.sources[grade]).filter(Boolean)]
    .map((source) => new Date(source!.checkedAt).getTime());
  const checkedAt = checkedTimes.length ? new Date(Math.max(...checkedTimes)) : new Date();
  const sourceName = (grade: (typeof gradeKeys)[number]) => payload.sources[grade]?.source ?? null;

  const result = await db.transaction(async (tx) => {
    const [valuation] = await tx.insert(valuations).values({
      physicalCardId: id,
      gradingRunId: run.id,
      rawLow: s(payload.rawLow), rawHigh: s(payload.rawHigh), rawMid: s(rawMid),
      value1: s(payload.values["1"]), value2: s(payload.values["2"]), value3: s(payload.values["3"]), value4: s(payload.values["4"]),
      value5: s(payload.values["5"]), value6: s(payload.values["6"]), value7: s(payload.values["7"]), value8: s(payload.values["8"]), value9: s(payload.values["9"]), value10: s(payload.values["10"]),
      source1: sourceName("1"), source2: sourceName("2"), source3: sourceName("3"), source4: sourceName("4"),
      source5: sourceName("5"), source6: sourceName("6"), source7: sourceName("7"), source8: sourceName("8"), source9: sourceName("9"), source10: sourceName("10"),
      sourceDetails, checkedAt, expectedGradedValue: s(expectedGradedValue), grossEvUplift: s(grossEvUplift), notes: payload.notes,
    }).returning({ id: valuations.id });
    await tx.update(physicalCards).set({
      rawLow: payload.rawLow == null ? card.rawLow : s(payload.rawLow),
      rawHigh: payload.rawHigh == null ? card.rawHigh : s(payload.rawHigh),
      rawMid: s(rawMid),
      latestExpectedValue: s(expectedGradedValue),
      latestEvUplift: s(grossEvUplift),
      updatedAt: new Date(),
    }).where(eq(physicalCards.id, id));
    return valuation;
  });

  return NextResponse.json({
    ok: true,
    valuationId: result.id,
    gradingRunId: run.id,
    expectedGradedValue,
    grossEvUplift,
    formula: "sum(probability × exact-grade value), including every nonzero PSA grade probability",
  });
}
