import { z } from "zod";

export const gradeKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
const probability = z.number().min(0).max(1).optional().nullable();
const probabilitiesSchema = z.object(Object.fromEntries(gradeKeys.map((grade) => [grade, probability])) as Record<(typeof gradeKeys)[number], typeof probability>)
  .superRefine((values, context) => {
    const supplied = gradeKeys.map((grade) => values[grade]).filter((value): value is number => value != null);
    if (!supplied.length) {
      context.addIssue({ code: "custom", message: "At least one PSA grade probability is required." });
      return;
    }
    const total = supplied.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 1) > 0.001) {
      context.addIssue({ code: "custom", message: `Grade probabilities must total 1.0 (received ${total.toFixed(4)}).` });
    }
  });

const ratio = z.number().min(0).max(100);
export const centeringMeasurementsSchema = z.object({
  frontLeft: ratio.optional().nullable(),
  frontRight: ratio.optional().nullable(),
  frontTop: ratio.optional().nullable(),
  frontBottom: ratio.optional().nullable(),
  backLeft: ratio.optional().nullable(),
  backRight: ratio.optional().nullable(),
  backTop: ratio.optional().nullable(),
  backBottom: ratio.optional().nullable(),
}).optional().nullable().superRefine((values, context) => {
  if (!values) return;
  for (const [a, b, label] of [
    [values.frontLeft, values.frontRight, "Front L/R"],
    [values.frontTop, values.frontBottom, "Front T/B"],
    [values.backLeft, values.backRight, "Back L/R"],
    [values.backTop, values.backBottom, "Back T/B"],
  ] as const) {
    if (a != null && b != null && Math.abs(a + b - 100) > 0.1) {
      context.addIssue({ code: "custom", message: `${label} measurements must total 100.` });
    }
  }
});

export const defectSchema = z.object({
  side: z.string().max(40).optional().nullable(),
  region: z.string().max(80).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  severity: z.string().max(40).optional().nullable(),
  description: z.string().min(1).max(1000),
  mediaAssetId: z.string().uuid().optional().nullable(),
  extractedFrameId: z.string().uuid().optional().nullable(),
});

export const gradePayloadSchema = z.object({
  rubricVersion: z.string().min(1).max(100).default("psa-strict-v1"),
  centering: z.object({ grade: z.string().min(1).max(40), notes: z.string().max(4000).default("") }),
  corners: z.object({ grade: z.string().min(1).max(40), notes: z.string().max(4000).default("") }),
  edges: z.object({ grade: z.string().min(1).max(40), notes: z.string().max(4000).default("") }),
  surface: z.object({ grade: z.string().min(1).max(40), notes: z.string().max(4000).default("") }),
  centeringMeasurements: centeringMeasurementsSchema,
  likelyGrade: z.number().min(1).max(10),
  likelyGradeLabel: z.string().min(1).max(100),
  probabilities: probabilitiesSchema,
  confidence: z.number().min(0).max(1).optional().nullable(),
  decision: z.enum(["grade", "conditional", "hold", "recheck", "do_not_grade"]),
  notes: z.string().max(8000).default(""),
  defects: z.array(defectSchema).max(100).default([]),
  sourceContext: z.record(z.string(), z.unknown()).optional().default({}),
});

export type GradePayload = z.infer<typeof gradePayloadSchema>;

const valuationMethod = z.enum([
  "psa_recent_sales_median",
  "psa_estimate",
  "pricecharting_fallback",
  "tcgplayer_raw",
  "pricecharting_raw",
  "other",
]);

const valuationSourceSchema = z.object({
  source: z.string().min(1).max(120),
  method: valuationMethod,
  url: z.string().url().max(2000).optional().nullable(),
  checkedAt: z.iso.datetime({ offset: true }),
  saleCount: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
}).superRefine((source, context) => {
  if (source.method === "psa_recent_sales_median" && (source.saleCount ?? 0) < 3) {
    context.addIssue({ code: "custom", message: "PSA direct-sale median requires at least 3 usable exact-grade sales." });
  }
});

const optionalValue = z.number().nonnegative().optional().nullable();
export const valuationPayloadSchema = z.object({
  rawLow: optionalValue,
  rawHigh: optionalValue,
  rawMid: optionalValue,
  rawSources: z.array(valuationSourceSchema).max(10).default([]),
  values: z.object(Object.fromEntries(gradeKeys.map((grade) => [grade, optionalValue])) as Record<(typeof gradeKeys)[number], typeof optionalValue>),
  sources: z.object(Object.fromEntries(gradeKeys.map((grade) => [grade, valuationSourceSchema.optional().nullable()])) as Record<(typeof gradeKeys)[number], z.ZodNullable<z.ZodOptional<typeof valuationSourceSchema>>>),
  gradingRunId: z.string().uuid().optional().nullable(),
  notes: z.string().max(8000).default(""),
});

export type ValuationPayload = z.infer<typeof valuationPayloadSchema>;
