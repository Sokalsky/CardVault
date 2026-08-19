import { NextRequest, NextResponse } from "next/server";
import { internalAuthorized } from "@/lib/internal-auth";
import { listCards } from "@/lib/repository";

export async function GET(request: NextRequest) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cards = (await listCards()).filter((card) => card.gradingStatus === "ready_for_grading");
  return NextResponse.json({ cards });
}
