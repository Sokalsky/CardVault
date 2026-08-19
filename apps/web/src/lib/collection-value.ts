type ValuedCard = {
  rawMid?: number | null;
  expectedValue?: number | null;
  evUplift?: number | null;
};

export function calculateCollectionValue(cards: ValuedCard[]) {
  const assessed = cards.filter((card) => card.expectedValue != null && card.evUplift != null);
  const rawTotal = cards.reduce((sum, card) => sum + Number(card.rawMid || 0), 0);
  const assessedRawMidpoint = assessed.reduce((sum, card) => sum + Number(card.rawMid || 0), 0);
  const expectedSlabValue = assessed.reduce((sum, card) => sum + Number(card.expectedValue || 0), 0);
  const grossUplift = expectedSlabValue - assessedRawMidpoint;

  return {
    assessedCount: assessed.length,
    rawTotal,
    assessedRawMidpoint,
    expectedSlabValue,
    grossUplift,
    gradingAdjustedValue: rawTotal - assessedRawMidpoint + expectedSlabValue,
  };
}
