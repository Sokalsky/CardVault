import { gradeKeys } from "@/lib/grade-schema";

type GradeMap = Partial<Record<(typeof gradeKeys)[number], number | null | undefined>>;

export function calculateExpectedGradedValue(probabilities: GradeMap, values: GradeMap) {
  let expected = 0;
  for (const grade of gradeKeys) {
    const probability = probabilities[grade] ?? 0;
    if (probability < 0 || probability > 1) throw new Error(`Invalid PSA ${grade} probability.`);
    const value = values[grade];
    if (probability > 0 && value == null) throw new Error(`A PSA ${grade} value is required because its probability is above zero.`);
    if (value != null && value < 0) throw new Error(`PSA ${grade} value cannot be negative.`);
    expected += probability * (value ?? 0);
  }
  return Math.round((expected + Number.EPSILON) * 100) / 100;
}

export function calculateGrossEvUplift(expectedGradedValue: number, rawMid: number) {
  return Math.round((expectedGradedValue - rawMid + Number.EPSILON) * 100) / 100;
}
