import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { physicalCards } from "@/db/schema";
import { internalAuthorized } from "@/lib/internal-auth";

const schema = z.object({ status: z.enum(["ungraded", "needs_photos", "ready_for_grading", "grading", "needs_more_photos", "graded", "recheck", "grade_candidate", "do_not_grade", "submitted_to_psa", "psa_returned"]) });
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb(); if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid physical card ID" }, { status: 400 });
  await db.update(physicalCards).set({ gradingStatus: parsed.data.status, updatedAt: new Date() }).where(eq(physicalCards.id, id));
  return NextResponse.json({ ok: true });
}
