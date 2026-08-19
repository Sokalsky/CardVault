import assert from "node:assert/strict";
import test from "node:test";
import { calculateExpectedGradedValue, calculateGrossEvUplift } from "./valuation";

test("expected graded value includes PSA 5 probability", () => {
  const expected = calculateExpectedGradedValue(
    { "5": 0.1, "6": 0.2, "7": 0.3, "8": 0.4 },
    { "5": 20, "6": 30, "7": 50, "8": 100 },
  );
  assert.equal(expected, 63);
  assert.equal(calculateGrossEvUplift(expected, 25), 38);
});

test("expected graded value rejects a missing value with nonzero probability", () => {
  assert.throws(() => calculateExpectedGradedValue({ "5": 0.25, "9": 0.75 }, { "9": 100 }), /PSA 5 value/);
});
