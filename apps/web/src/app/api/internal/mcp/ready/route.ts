import { NextRequest, NextResponse } from "next/server";
import { internalAuthorized } from "@/lib/internal-auth";
import { listCards } from "@/lib/repository";
import { getDb } from "@/db/client";
import { mediaAssets } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { assessMediaReadiness } from "@/lib/media-readiness";

export async function GET(request: NextRequest) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cards = (await listCards()).filter((card) => card.gradingStatus === "ready_for_grading");
  if (!cards.length) return NextResponse.json({ cards: [] });
  const db = getDb();
  if (!db) return NextResponse.json({ cards: [] });
  const rows = await db.select({ physicalCardId: mediaAssets.physicalCardId, kind: mediaAssets.kind, captureType: mediaAssets.captureType, processingStatus: mediaAssets.processingStatus, selectedForGrading: mediaAssets.selectedForGrading })
    .from(mediaAssets)
    .where(inArray(mediaAssets.physicalCardId, cards.map((card) => card.id)));
  const byCard = new Map<string, typeof rows>();
  for (const row of rows) byCard.set(row.physicalCardId, [...(byCard.get(row.physicalCardId) || []), row]);
  const gradeable = cards.filter((card) => assessMediaReadiness(byCard.get(card.id) || []).ready);
  return NextResponse.json({ cards: gradeable });
}
