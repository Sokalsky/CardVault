import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { gradingRuns, physicalCards, psaSubmissionBatches, psaSubmissionItems } from "@/db/schema";
import { webAuthorized } from "@/lib/web-auth";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  serviceLevel: z.string().trim().max(80).nullable().optional(),
  gradingFeePerCard: z.number().nonnegative().max(10000).nullable().optional(),
  shippingEstimate: z.number().nonnegative().max(100000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  cardIds: z.array(z.uuid()).min(1).max(100),
});

const numeric = (value?: number | null) => value == null ? null : String(value);

export async function POST(request: Request) {
  if (!webAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const uniqueIds = [...new Set(input.cardIds)];
  if (uniqueIds.length !== input.cardIds.length) return NextResponse.json({ error: "Duplicate card IDs are not allowed" }, { status: 400 });

  const cards = await db.select({
    id: physicalCards.id,
    status: physicalCards.gradingStatus,
    decision: physicalCards.submissionDecision,
    likelyGrade: physicalCards.latestLikelyGrade,
    expectedValue: physicalCards.latestExpectedValue,
    evUplift: physicalCards.latestEvUplift,
  }).from(physicalCards).where(inArray(physicalCards.id, uniqueIds));
  const eligible = cards.filter((card) =>
    ["graded", "grade_candidate"].includes(card.status)
    && card.decision === "grade"
    && Number(card.expectedValue || 0) > 0
    && Number(card.evUplift || 0) > 0
  );
  if (eligible.length !== uniqueIds.length) {
    return NextResponse.json({ error: "Every selected card must remain a graded, recommended candidate with a positive expected value" }, { status: 409 });
  }

  const runs = await db.select({
    id: gradingRuns.id,
    physicalCardId: gradingRuns.physicalCardId,
  }).from(gradingRuns).where(inArray(gradingRuns.physicalCardId, uniqueIds)).orderBy(desc(gradingRuns.createdAt));
  const latestRunByCard = new Map<string, string>();
  for (const run of runs) if (!latestRunByCard.has(run.physicalCardId)) latestRunByCard.set(run.physicalCardId, run.id);
  if (latestRunByCard.size !== uniqueIds.length) return NextResponse.json({ error: "Every selected card needs a grading run" }, { status: 409 });

  const result = await db.transaction(async (transaction) => {
    const [batch] = await transaction.insert(psaSubmissionBatches).values({
      name: input.name,
      serviceLevel: input.serviceLevel || null,
      gradingFeePerCard: numeric(input.gradingFeePerCard),
      shippingEstimate: numeric(input.shippingEstimate),
      notes: input.notes || null,
      status: "draft",
    }).returning({ id: psaSubmissionBatches.id });
    await transaction.insert(psaSubmissionItems).values(eligible.map((card) => ({
      batchId: batch.id,
      physicalCardId: card.id,
      gradingRunId: latestRunByCard.get(card.id),
      declaredValue: card.expectedValue,
      expectedGrade: card.likelyGrade,
      expectedValue: card.expectedValue,
    })));
    return batch;
  });

  return NextResponse.json({ ok: true, batchId: result.id, itemCount: eligible.length }, { status: 201 });
}
