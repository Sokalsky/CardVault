import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { internalAuthorized } from "@/lib/internal-auth";
import { getValuationHistory } from "@/lib/repository";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid physical card ID" }, { status: 400 });
  return NextResponse.json({ valuationHistory: await getValuationHistory(id) });
}
