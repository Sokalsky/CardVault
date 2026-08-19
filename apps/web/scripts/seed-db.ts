import fs from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { cardPrintings, gradingRuns, physicalCards, valuations } from "../src/db/schema";
import type { DemoCard, DemoGrading } from "../src/lib/types";

type SeedGrading = DemoGrading & { psaDirectSource?: string | null; psaDirectNotes?: string | null };
type SeedCard = DemoCard & { source?: string | null; grading?: SeedGrading | null };
const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data/collection.json"), "utf8"));

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(Number(v)));
const bool = (v: unknown) => String(v || "").toLowerCase() === "yes";
const copyNumber = (label?: string | null) => {
  const m = String(label || "").match(/^(\d+)\s+of\s+\d+/i);
  return m ? Number(m[1]) : 1;
};
const likelyGrade = (g?: SeedGrading | null) => {
  if (!g?.probabilities) return null;
  return Object.entries(g.probabilities).filter(([,v]) => v !== null && v !== undefined).sort((a,b)=>Number(b[1])-Number(a[1]))[0]?.[0] || null;
};
const normalizedDecision = (value?: string | null) => {
  const text = String(value || "").toLowerCase();
  if (text.includes("do not") || text.includes("not grade")) return "do_not_grade";
  if (text.includes("conditional")) return "conditional";
  if (text.includes("recheck") || text.includes("hold")) return "recheck";
  if (text.includes("grade") || text.startsWith("yes")) return "grade";
  return "hold";
};
const frontCentering = (value?: string | null) => {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*L-R.*?(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*T-B/i);
  return match ? { left: match[1], right: match[2], top: match[3], bottom: match[4] } : null;
};

async function main() {
const db = getDb();
if (!db) throw new Error("DATABASE_URL is required.");

for (const card of data.cards as SeedCard[]) {
  const variant = card.variant || null;
  const existing = await db.select({id: cardPrintings.id}).from(cardPrintings).where(and(
    eq(cardPrintings.name, card.name),
    card.cardNumber ? eq(cardPrintings.cardNumber, card.cardNumber) : isNull(cardPrintings.cardNumber),
    card.setName ? eq(cardPrintings.setName, card.setName) : isNull(cardPrintings.setName),
    variant ? eq(cardPrintings.variant, variant) : isNull(cardPrintings.variant),
  )).limit(1);
  let printingId = existing[0]?.id;
  if (!printingId) {
    const [created] = await db.insert(cardPrintings).values({ name: card.name, cardNumber: card.cardNumber, setName: card.setName, year: card.year, variant, category: card.category, sourceUrl: card.sourceUrl }).returning({id: cardPrintings.id});
    printingId = created.id;
  }

  const grade = card.grading;
  const lg = likelyGrade(grade);
  const [physical] = await db.insert(physicalCards).values({
    legacyMasterId: card.masterId,
    cardPrintingId: printingId,
    copyLabel: card.copyLabel,
    copyNumber: copyNumber(card.copyLabel),
    rawLow: num(card.rawLow), rawHigh: num(card.rawHigh), rawMid: num(card.rawMid),
    asIsLow: num(card.asIsLow), asIsHigh: num(card.asIsHigh), asIsMid: num(card.asIsMid),
    valueBucket: card.valueBucket,
    conditionNote: card.condition,
    notes: card.notes,
    gradingStatus: card.gradingStatus,
    latestLikelyGrade: lg,
    latestGradeLabel: grade?.manualVisualEstimate || grade?.preGradeEstimate || null,
    latestExpectedValue: num(grade?.expectedGradedValue),
    latestEvUplift: num(grade?.grossEvUplift),
    submissionDecision: grade ? normalizedDecision(grade.decision) : null,
    sleeve: bool(card.sleeve), toploader: bool(card.toploader),
  }).onConflictDoUpdate({ target: physicalCards.legacyMasterId, set: {
    cardPrintingId: printingId, copyLabel: card.copyLabel, rawLow: num(card.rawLow), rawHigh: num(card.rawHigh), rawMid: num(card.rawMid),
    asIsLow: num(card.asIsLow), asIsHigh: num(card.asIsHigh), asIsMid: num(card.asIsMid), conditionNote: card.condition, notes: card.notes,
    gradingStatus: card.gradingStatus, latestLikelyGrade: lg, latestGradeLabel: grade?.manualVisualEstimate || grade?.preGradeEstimate || null,
    latestExpectedValue: num(grade?.expectedGradedValue), latestEvUplift: num(grade?.grossEvUplift), submissionDecision: grade ? normalizedDecision(grade.decision) : null, updatedAt: new Date(),
  }}).returning({id: physicalCards.id});

  if (grade) {
    const existingRuns = await db.select({id: gradingRuns.id}).from(gradingRuns).where(and(eq(gradingRuns.physicalCardId, physical.id), eq(gradingRuns.grader, "chat-history-import"))).limit(1);
    if (!existingRuns.length) {
      const measured = frontCentering(grade.centering);
      const [run] = await db.insert(gradingRuns).values({
        physicalCardId: physical.id, grader: "chat-history-import", rubricVersion: "psa-strict-v1",
        centeringGrade: grade.centering, cornersGrade: grade.corners, edgesGrade: grade.edges, surfaceGrade: grade.surface,
        likelyGrade: lg, likelyGradeLabel: grade.manualVisualEstimate || grade.preGradeEstimate,
        probability5: num(grade.probabilities?.["5"]), probability6: num(grade.probabilities?.["6"]), probability7: num(grade.probabilities?.["7"]),
        probability8: num(grade.probabilities?.["8"]), probability9: num(grade.probabilities?.["9"]), probability10: num(grade.probabilities?.["10"]),
        frontCenteringLeft: measured?.left, frontCenteringRight: measured?.right, frontCenteringTop: measured?.top, frontCenteringBottom: measured?.bottom,
        decision: normalizedDecision(grade.decision), notes: grade.inspectionNotes,
        sourceContext: { source: "v24 handoff workbook", manualGradeOdds: grade.manualGradeOdds, valuationSource: grade.gradedValueSource, psaDirectSource: grade.psaDirectSource },
      }).returning({id: gradingRuns.id});
      await db.insert(valuations).values({
        physicalCardId: physical.id, gradingRunId: run.id, rawMid: num(grade.rawMidUsed ?? card.rawMid),
        value5: num(grade.values?.["5"]), value6: num(grade.values?.["6"]), value7: num(grade.values?.["7"]), value8: num(grade.values?.["8"]), value9: num(grade.values?.["9"]), value10: num(grade.values?.["10"]),
        source5: grade.psaVerification, source6: grade.psaVerification, source7: grade.psaVerification, source8: grade.psaVerification, source9: grade.psaVerification, source10: grade.psaVerification,
        sourceDetails: { imported: true, rawSource: card.source, gradedValueSource: grade.gradedValueSource, psaDirectSource: grade.psaDirectSource, basis: grade.gradedValueBasis },
        checkedAt: new Date("2026-08-18T00:00:00-04:00"), expectedGradedValue: num(grade.expectedGradedValue), grossEvUplift: num(grade.grossEvUplift), notes: grade.psaVerificationNotes,
      });
    }
  }
}
console.log(`Seeded ${data.cards.length} physical cards.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
