import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cardPrintings, gradingDefects, gradingRuns, mediaAssets, physicalCards, extractedFrames, valuations } from "@/db/schema";
import { demoGetCard, demoListCards } from "@/lib/demo-data";
import type { CardDetail, CardListItem, MediaForGrading } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";
import cardImages from "@/data/card-images.json";
import collection from "@/data/collection.json";

const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const referenceImages = cardImages as Record<string, string>;
const activeLegacyIds = new Set(collection.cards.map((card) => card.masterId));

type ListCardsOptions = { includeThumbnails?: boolean };

export function isDemoMode() {
  return !process.env.DATABASE_URL;
}

export async function listCards(options: ListCardsOptions = {}): Promise<CardListItem[]> {
  const db = getDb();
  if (!db) return demoListCards();

  try {
  const rows = await db
    .select({
      id: physicalCards.id,
      legacyMasterId: physicalCards.legacyMasterId,
      name: cardPrintings.name,
      cardNumber: cardPrintings.cardNumber,
      setName: cardPrintings.setName,
      year: cardPrintings.year,
      variant: cardPrintings.variant,
      copyLabel: physicalCards.copyLabel,
      rawMid: physicalCards.rawMid,
      asIsMid: physicalCards.asIsMid,
      gradingStatus: physicalCards.gradingStatus,
      likelyGradeLabel: physicalCards.latestGradeLabel,
      expectedValue: physicalCards.latestExpectedValue,
      evUplift: physicalCards.latestEvUplift,
      toploader: physicalCards.toploader,
      submissionDecision: physicalCards.submissionDecision,
    })
    .from(physicalCards)
    .innerJoin(cardPrintings, eq(physicalCards.cardPrintingId, cardPrintings.id))
    .orderBy(desc(physicalCards.rawMid));

  const mediaRows = await db.select({
    physicalCardId: mediaAssets.physicalCardId,
    kind: mediaAssets.kind,
    captureType: mediaAssets.captureType,
    storagePath: mediaAssets.storagePath,
    originalFilename: mediaAssets.originalFilename,
    processingStatus: mediaAssets.processingStatus,
  }).from(mediaAssets);
  const mediaCounts = new Map<string, number>();
  for (const media of mediaRows) mediaCounts.set(media.physicalCardId, (mediaCounts.get(media.physicalCardId) || 0) + 1);

  const gradingFrontPaths = new Map<string, { path: string; priority: number }>();
  if (options.includeThumbnails) {
    for (const media of mediaRows) {
      if (media.kind !== "image" || media.processingStatus !== "ready") continue;
      const isExplicitFront = media.captureType === "front";
      const isLegacyFront = media.captureType === "imported_grading_photo" && /^0*1[_\s.-]/i.test(media.originalFilename || "");
      if (!isExplicitFront && !isLegacyFront) continue;
      const priority = isExplicitFront ? 0 : 1;
      const current = gradingFrontPaths.get(media.physicalCardId);
      if (!current || priority < current.priority) gradingFrontPaths.set(media.physicalCardId, { path: media.storagePath, priority });
    }
  }

  const signedFronts = new Map<string, string>();
  const supabase = options.includeThumbnails ? getSupabaseAdmin() : null;
  if (supabase && gradingFrontPaths.size) {
    try {
      const bucket = process.env.MEDIA_BUCKET || "grading-media";
      const cardIds = [...gradingFrontPaths.keys()];
      const paths = cardIds.map((cardId) => gradingFrontPaths.get(cardId)!.path);
      const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
      data?.forEach((signed, index) => {
        if (signed.signedUrl) signedFronts.set(cardIds[index], signed.signedUrl);
      });
    } catch (error) {
      console.error("Could not sign collection thumbnails; using reference images.", error);
    }
  }

  return rows.filter((row) => row.legacyMasterId == null || activeLegacyIds.has(row.legacyMasterId)).map((row) => ({
    ...row,
    rawMid: n(row.rawMid),
    asIsMid: n(row.asIsMid),
    expectedValue: n(row.expectedValue),
    evUplift: n(row.evUplift),
    mediaCount: mediaCounts.get(row.id) || 0,
    thumbnailUrl: signedFronts.get(row.id) || referenceImages[String(row.legacyMasterId)] || null,
    thumbnailSource: signedFronts.has(row.id) ? "grading" as const : referenceImages[String(row.legacyMasterId)] ? "reference" as const : null,
  }));
  } catch (error) {
    console.error("Database read failed; serving the preserved read-only collection.", error);
    return demoListCards();
  }
}

export async function getCardMedia(cardId: string): Promise<MediaForGrading[]> {
  const db = getDb();
  if (!db) return [];
  const supabase = getSupabaseAdmin();
  const bucket = process.env.MEDIA_BUCKET || "grading-media";

  const media = await db.select().from(mediaAssets).where(eq(mediaAssets.physicalCardId, cardId));
  const frames = await db.select().from(extractedFrames).where(eq(extractedFrames.physicalCardId, cardId));
  const mediaById = new Map(media.map((m) => [m.id, m]));

  const combined: MediaForGrading[] = [
    ...media.map((m) => ({
      id: m.id,
      kind: m.kind,
      captureType: m.captureType,
      mimeType: m.mimeType,
      storagePath: m.storagePath,
      selectedForGrading: m.selectedForGrading,
      processingStatus: m.processingStatus,
    })),
    ...frames.map((f) => ({
      id: f.id,
      kind: "image",
      captureType: `${mediaById.get(f.mediaAssetId)?.captureType || "video"}_frame`,
      mimeType: "image/jpeg",
      storagePath: f.storagePath,
      selectedForGrading: f.selectedForGrading,
      timestampMs: f.timestampMs,
      sharpnessScore: n(f.sharpnessScore),
      exposureScore: n(f.exposureScore),
      overallScore: n(f.overallScore),
      processingStatus: "ready",
    })),
  ];

  if (!supabase) return combined;
  await Promise.all(
    combined.map(async (item) => {
      if (!item.storagePath) return;
      const { data } = await supabase.storage.from(bucket).createSignedUrl(item.storagePath, 900);
      item.signedUrl = data?.signedUrl ?? null;
    }),
  );
  return combined;
}

export async function getGradingHistory(cardId: string) {
  const db = getDb();
  if (!db) return [];
  const runs = await db.select().from(gradingRuns).where(eq(gradingRuns.physicalCardId, cardId)).orderBy(desc(gradingRuns.createdAt));
  const defects = await db.select().from(gradingDefects).where(eq(gradingDefects.physicalCardId, cardId));
  return runs.map((run) => ({ ...run, defects: defects.filter((defect) => defect.gradingRunId === run.id) }));
}

export async function getValuationHistory(cardId: string) {
  const db = getDb();
  if (!db) return [];
  return db.select().from(valuations).where(eq(valuations.physicalCardId, cardId)).orderBy(desc(valuations.createdAt));
}

export async function getCard(id: string): Promise<CardDetail | null> {
  const db = getDb();
  if (!db || id.startsWith("legacy-")) return demoGetCard(id);

  const [row] = await db
    .select({
      id: physicalCards.id,
      legacyMasterId: physicalCards.legacyMasterId,
      name: cardPrintings.name,
      cardNumber: cardPrintings.cardNumber,
      setName: cardPrintings.setName,
      year: cardPrintings.year,
      variant: cardPrintings.variant,
      category: cardPrintings.category,
      sourceUrl: cardPrintings.sourceUrl,
      copyLabel: physicalCards.copyLabel,
      rawLow: physicalCards.rawLow,
      rawHigh: physicalCards.rawHigh,
      rawMid: physicalCards.rawMid,
      asIsMid: physicalCards.asIsMid,
      condition: physicalCards.conditionNote,
      notes: physicalCards.notes,
      gradingStatus: physicalCards.gradingStatus,
      likelyGradeLabel: physicalCards.latestGradeLabel,
      expectedValue: physicalCards.latestExpectedValue,
      evUplift: physicalCards.latestEvUplift,
      toploader: physicalCards.toploader,
      submissionDecision: physicalCards.submissionDecision,
    })
    .from(physicalCards)
    .innerJoin(cardPrintings, eq(physicalCards.cardPrintingId, cardPrintings.id))
    .where(eq(physicalCards.id, id))
    .limit(1);

  if (!row) return null;

  const history = await getGradingHistory(id);

  const latest = history[0];
  const defects = latest?.defects || [];
  const [latestValuationRow] = await db
    .select()
    .from(valuations)
    .where(eq(valuations.physicalCardId, id))
    .orderBy(desc(valuations.createdAt))
    .limit(1);

  const latestGrade = latest
    ? {
        preGradeEstimate: latest.likelyGradeLabel,
        decision: latest.decision,
        centering: latest.centeringGrade,
        centeringNotes: latest.centeringNotes,
        corners: latest.cornersGrade,
        cornersNotes: latest.cornersNotes,
        edges: latest.edgesGrade,
        edgesNotes: latest.edgesNotes,
        surface: latest.surfaceGrade,
        surfaceNotes: latest.surfaceNotes,
        inspectionNotes: latest.notes,
        probabilities: {
          "1": n(latest.probability1),
          "2": n(latest.probability2),
          "3": n(latest.probability3),
          "4": n(latest.probability4),
          "5": n(latest.probability5),
          "6": n(latest.probability6),
          "7": n(latest.probability7),
          "8": n(latest.probability8),
          "9": n(latest.probability9),
          "10": n(latest.probability10),
        },
        defects: defects.map((d) => ({
          side: d.side, region: d.region, category: d.category, severity: d.severity, description: d.description,
        })),
        centeringMeasurements: {
          frontLeft: n(latest.frontCenteringLeft), frontRight: n(latest.frontCenteringRight),
          frontTop: n(latest.frontCenteringTop), frontBottom: n(latest.frontCenteringBottom),
          backLeft: n(latest.backCenteringLeft), backRight: n(latest.backCenteringRight),
          backTop: n(latest.backCenteringTop), backBottom: n(latest.backCenteringBottom),
        },
        rubricVersion: latest.rubricVersion,
        gradedAt: latest.createdAt,
      }
    : null;

  return {
    ...row,
    rawLow: n(row.rawLow),
    rawHigh: n(row.rawHigh),
    rawMid: n(row.rawMid),
    asIsMid: n(row.asIsMid),
    expectedValue: n(row.expectedValue),
    evUplift: n(row.evUplift),
    latestGrade,
    gradingHistory: history,
    media: await getCardMedia(id),
    latestValuation: latestValuationRow ? {
      values: {
        "1": n(latestValuationRow.value1), "2": n(latestValuationRow.value2), "3": n(latestValuationRow.value3), "4": n(latestValuationRow.value4),
        "5": n(latestValuationRow.value5), "6": n(latestValuationRow.value6), "7": n(latestValuationRow.value7),
        "8": n(latestValuationRow.value8), "9": n(latestValuationRow.value9), "10": n(latestValuationRow.value10),
      },
      sources: {
        "1": latestValuationRow.source1, "2": latestValuationRow.source2, "3": latestValuationRow.source3, "4": latestValuationRow.source4,
        "5": latestValuationRow.source5, "6": latestValuationRow.source6, "7": latestValuationRow.source7,
        "8": latestValuationRow.source8, "9": latestValuationRow.source9, "10": latestValuationRow.source10,
      },
      expectedGradedValue: n(latestValuationRow.expectedGradedValue),
      grossEvUplift: n(latestValuationRow.grossEvUplift),
      notes: latestValuationRow.notes,
      sourceDetails: latestValuationRow.sourceDetails as Record<string, unknown> | null,
      checkedAt: latestValuationRow.checkedAt,
    } : null,
  };
}
