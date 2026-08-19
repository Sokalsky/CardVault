import { NextRequest, NextResponse } from "next/server";
import { internalAuthorized } from "@/lib/internal-auth";
import { listCards } from "@/lib/repository";

export async function GET(request: NextRequest) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cards = (await listCards()).filter((card) => ["graded", "grade_candidate"].includes(card.gradingStatus) && card.submissionDecision === "grade" && Number(card.evUplift || 0) > 0).sort((a,b)=>Number(b.evUplift||0)-Number(a.evUplift||0));
  return NextResponse.json({ cards });
}
