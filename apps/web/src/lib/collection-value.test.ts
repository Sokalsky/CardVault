import test from "node:test";
import assert from "node:assert/strict";
import dataset from "@/data/collection.json";
import { calculateCollectionValue } from "@/lib/collection-value";

test("collection EV includes every assessed card, including do-not-grade decisions", () => {
  const value = calculateCollectionValue([
    { rawMid: 10, expectedValue: 30, evUplift: 20 },
    { rawMid: 20, expectedValue: 15, evUplift: -5 },
    { rawMid: 40, expectedValue: null, evUplift: null },
  ]);

  assert.deepEqual(value, {
    assessedCount: 2,
    rawTotal: 70,
    assessedRawMidpoint: 30,
    expectedSlabValue: 45,
    grossUplift: 15,
    gradingAdjustedValue: 85,
  });
});

test("v25 collection EV matches the reconciled workbook", () => {
  const value = calculateCollectionValue(dataset.cards.map((card) => ({
    rawMid: card.rawMid,
    expectedValue: card.grading?.expectedGradedValue,
    evUplift: card.grading?.grossEvUplift,
  })));

  assert.equal(value.assessedCount, 17);
  assert.equal(Number(value.assessedRawMidpoint.toFixed(2)), 1044.43);
  assert.equal(Number(value.expectedSlabValue.toFixed(2)), 5405.69);
  assert.equal(Number(value.grossUplift.toFixed(2)), 4361.25);
  assert.equal(Number(value.gradingAdjustedValue.toFixed(2)), 14290.41);
});
