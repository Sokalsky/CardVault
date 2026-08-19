import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const cardPrintings = pgTable(
  "card_printings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    cardNumber: text("card_number"),
    setName: text("set_name"),
    year: integer("year"),
    variant: text("variant"),
    category: text("category"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("card_printings_identity_idx").on(t.name, t.cardNumber, t.setName, t.variant),
  ],
);

export const physicalCards = pgTable("physical_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  legacyMasterId: integer("legacy_master_id").unique(),
  cardPrintingId: uuid("card_printing_id")
    .notNull()
    .references(() => cardPrintings.id, { onDelete: "cascade" }),
  copyLabel: text("copy_label"),
  copyNumber: integer("copy_number"),
  rawLow: numeric("raw_low", { precision: 12, scale: 2 }),
  rawHigh: numeric("raw_high", { precision: 12, scale: 2 }),
  rawMid: numeric("raw_mid", { precision: 12, scale: 2 }),
  asIsLow: numeric("as_is_low", { precision: 12, scale: 2 }),
  asIsHigh: numeric("as_is_high", { precision: 12, scale: 2 }),
  asIsMid: numeric("as_is_mid", { precision: 12, scale: 2 }),
  valueBucket: text("value_bucket"),
  conditionNote: text("condition_note"),
  notes: text("notes"),
  gradingStatus: text("grading_status").default("ungraded").notNull(),
  latestLikelyGrade: numeric("latest_likely_grade", { precision: 4, scale: 1 }),
  latestGradeLabel: text("latest_grade_label"),
  latestExpectedValue: numeric("latest_expected_value", { precision: 12, scale: 2 }),
  latestEvUplift: numeric("latest_ev_uplift", { precision: 12, scale: 2 }),
  submissionDecision: text("submission_decision"),
  sleeve: boolean("sleeve").default(false).notNull(),
  toploader: boolean("toploader").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  physicalCardId: uuid("physical_card_id")
    .notNull()
    .references(() => physicalCards.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  captureType: text("capture_type").default("grading_photo").notNull(),
  storagePath: text("storage_path").notNull(),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  byteSize: integer("byte_size"),
  width: integer("width"),
  height: integer("height"),
  durationMs: integer("duration_ms"),
  processingStatus: text("processing_status").default("ready").notNull(),
  selectedForGrading: boolean("selected_for_grading").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const extractedFrames = pgTable("extracted_frames", {
  id: uuid("id").defaultRandom().primaryKey(),
  mediaAssetId: uuid("media_asset_id")
    .notNull()
    .references(() => mediaAssets.id, { onDelete: "cascade" }),
  physicalCardId: uuid("physical_card_id")
    .notNull()
    .references(() => physicalCards.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  timestampMs: integer("timestamp_ms"),
  sharpnessScore: numeric("sharpness_score", { precision: 12, scale: 4 }),
  exposureScore: numeric("exposure_score", { precision: 8, scale: 6 }),
  overallScore: numeric("overall_score", { precision: 12, scale: 6 }),
  perceptualHash: text("perceptual_hash"),
  selectedForGrading: boolean("selected_for_grading").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const gradingRuns = pgTable("grading_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  physicalCardId: uuid("physical_card_id")
    .notNull()
    .references(() => physicalCards.id, { onDelete: "cascade" }),
  grader: text("grader").default("chatgpt").notNull(),
  rubricVersion: text("rubric_version").default("psa-strict-v1").notNull(),
  centeringGrade: text("centering_grade"),
  centeringNotes: text("centering_notes"),
  cornersGrade: text("corners_grade"),
  cornersNotes: text("corners_notes"),
  edgesGrade: text("edges_grade"),
  edgesNotes: text("edges_notes"),
  surfaceGrade: text("surface_grade"),
  surfaceNotes: text("surface_notes"),
  likelyGrade: numeric("likely_grade", { precision: 4, scale: 1 }),
  likelyGradeLabel: text("likely_grade_label"),
  probability5: numeric("probability_5", { precision: 6, scale: 4 }),
  probability6: numeric("probability_6", { precision: 6, scale: 4 }),
  probability7: numeric("probability_7", { precision: 6, scale: 4 }),
  probability8: numeric("probability_8", { precision: 6, scale: 4 }),
  probability9: numeric("probability_9", { precision: 6, scale: 4 }),
  probability10: numeric("probability_10", { precision: 6, scale: 4 }),
  probability1: numeric("probability_1", { precision: 6, scale: 4 }),
  probability2: numeric("probability_2", { precision: 6, scale: 4 }),
  probability3: numeric("probability_3", { precision: 6, scale: 4 }),
  probability4: numeric("probability_4", { precision: 6, scale: 4 }),
  frontCenteringLeft: numeric("front_centering_left", { precision: 5, scale: 2 }),
  frontCenteringRight: numeric("front_centering_right", { precision: 5, scale: 2 }),
  frontCenteringTop: numeric("front_centering_top", { precision: 5, scale: 2 }),
  frontCenteringBottom: numeric("front_centering_bottom", { precision: 5, scale: 2 }),
  backCenteringLeft: numeric("back_centering_left", { precision: 5, scale: 2 }),
  backCenteringRight: numeric("back_centering_right", { precision: 5, scale: 2 }),
  backCenteringTop: numeric("back_centering_top", { precision: 5, scale: 2 }),
  backCenteringBottom: numeric("back_centering_bottom", { precision: 5, scale: 2 }),
  confidence: numeric("confidence", { precision: 6, scale: 4 }),
  decision: text("decision"),
  notes: text("notes"),
  sourceContext: jsonb("source_context"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const gradingDefects = pgTable("grading_defects", {
  id: uuid("id").defaultRandom().primaryKey(),
  gradingRunId: uuid("grading_run_id")
    .notNull()
    .references(() => gradingRuns.id, { onDelete: "cascade" }),
  physicalCardId: uuid("physical_card_id")
    .notNull()
    .references(() => physicalCards.id, { onDelete: "cascade" }),
  side: text("side"),
  region: text("region"),
  category: text("category"),
  severity: text("severity"),
  description: text("description").notNull(),
  mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  extractedFrameId: uuid("extracted_frame_id").references(() => extractedFrames.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const valuations = pgTable("valuations", {
  id: uuid("id").defaultRandom().primaryKey(),
  physicalCardId: uuid("physical_card_id")
    .notNull()
    .references(() => physicalCards.id, { onDelete: "cascade" }),
  gradingRunId: uuid("grading_run_id").references(() => gradingRuns.id, { onDelete: "set null" }),
  rawLow: numeric("raw_low", { precision: 12, scale: 2 }),
  rawHigh: numeric("raw_high", { precision: 12, scale: 2 }),
  rawMid: numeric("raw_mid", { precision: 12, scale: 2 }),
  value5: numeric("value_5", { precision: 12, scale: 2 }),
  value6: numeric("value_6", { precision: 12, scale: 2 }),
  value7: numeric("value_7", { precision: 12, scale: 2 }),
  value8: numeric("value_8", { precision: 12, scale: 2 }),
  value9: numeric("value_9", { precision: 12, scale: 2 }),
  value10: numeric("value_10", { precision: 12, scale: 2 }),
  value1: numeric("value_1", { precision: 12, scale: 2 }),
  value2: numeric("value_2", { precision: 12, scale: 2 }),
  value3: numeric("value_3", { precision: 12, scale: 2 }),
  value4: numeric("value_4", { precision: 12, scale: 2 }),
  source5: text("source_5"),
  source6: text("source_6"),
  source7: text("source_7"),
  source8: text("source_8"),
  source9: text("source_9"),
  source10: text("source_10"),
  source1: text("source_1"),
  source2: text("source_2"),
  source3: text("source_3"),
  source4: text("source_4"),
  sourceDetails: jsonb("source_details"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  expectedGradedValue: numeric("expected_graded_value", { precision: 12, scale: 2 }),
  grossEvUplift: numeric("gross_ev_uplift", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const psaSubmissionBatches = pgTable("psa_submission_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  status: text("status").default("draft").notNull(),
  serviceLevel: text("service_level"),
  gradingFeePerCard: numeric("grading_fee_per_card", { precision: 12, scale: 2 }),
  shippingEstimate: numeric("shipping_estimate", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const psaSubmissionItems = pgTable("psa_submission_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").notNull().references(() => psaSubmissionBatches.id, { onDelete: "cascade" }),
  physicalCardId: uuid("physical_card_id").notNull().references(() => physicalCards.id, { onDelete: "cascade" }),
  gradingRunId: uuid("grading_run_id").references(() => gradingRuns.id, { onDelete: "set null" }),
  declaredValue: numeric("declared_value", { precision: 12, scale: 2 }),
  expectedGrade: numeric("expected_grade", { precision: 4, scale: 1 }),
  expectedValue: numeric("expected_value", { precision: 12, scale: 2 }),
  actualGrade: numeric("actual_grade", { precision: 4, scale: 1 }),
  psaCertNumber: text("psa_cert_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("psa_submission_items_batch_card_idx").on(t.batchId, t.physicalCardId)]);

export const processingJobs = pgTable("processing_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, { onDelete: "cascade" }),
  physicalCardId: uuid("physical_card_id").references(() => physicalCards.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: text("status").default("queued").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
