import dataset from "@/data/collection.json";
import cardImages from "@/data/card-images.json";
import type { CardDetail, CardListItem, DemoCard } from "@/lib/types";

const cards = dataset.cards as DemoCard[];
const referenceImages = cardImages as Record<string, string>;

export const demoSummary = dataset.summary;

function likelyLabel(card: DemoCard) {
  return card.grading?.manualVisualEstimate || card.grading?.preGradeEstimate || null;
}

export function demoListCards(): CardListItem[] {
  return cards.map((card) => ({
    id: `legacy-${card.masterId}`,
    legacyMasterId: card.masterId,
    name: card.name,
    cardNumber: card.cardNumber,
    setName: card.setName,
    year: card.year,
    variant: card.variant,
    copyLabel: card.copyLabel,
    rawMid: card.rawMid,
    asIsMid: card.asIsMid,
    gradingStatus: card.gradingStatus,
    likelyGradeLabel: likelyLabel(card),
    expectedValue: card.grading?.expectedGradedValue ?? null,
    evUplift: card.grading?.grossEvUplift ?? null,
    toploader: String(card.toploader).toLowerCase() === "yes",
    thumbnailUrl: referenceImages[String(card.masterId)] || null,
    thumbnailSource: referenceImages[String(card.masterId)] ? "reference" : null,
    demo: true,
  }));
}

export function demoGetCard(id: string): CardDetail | null {
  const masterId = Number(id.replace(/^legacy-/, ""));
  const card = cards.find((item) => item.masterId === masterId);
  if (!card) return null;
  return {
    ...demoListCards().find((item) => item.legacyMasterId === masterId)!,
    category: card.category,
    condition: card.condition,
    notes: card.notes,
    rawLow: card.rawLow,
    rawHigh: card.rawHigh,
    sourceUrl: card.sourceUrl,
    latestGrade: card.grading,
    gradingHistory: card.grading ? [card.grading as Record<string, unknown>] : [],
    media: [],
    latestValuation: card.grading ? {
      values: card.grading.values || {},
      sources: {},
      expectedGradedValue: card.grading.expectedGradedValue ?? null,
      grossEvUplift: card.grading.grossEvUplift ?? null,
      notes: card.grading.psaVerificationNotes || card.grading.gradedValueBasis || null,
    } : null,
  };
}
