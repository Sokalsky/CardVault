import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { physicalCards } from "@/db/schema";
import { webAuthorized } from "@/lib/web-auth";
const schema=z.object({status:z.enum(["needs_photos","ready_for_grading","grading","needs_more_photos","graded","recheck","grade_candidate","do_not_grade","submitted_to_psa","psa_returned","ungraded"])});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  if(!webAuthorized(req)) return NextResponse.json({error:"Unauthorized"},{status:401});
  const db=getDb(); if(!db) return NextResponse.json({error:"Database not configured"},{status:503});
  const parsed=schema.safeParse(await req.json()); if(!parsed.success) return NextResponse.json({error:parsed.error.flatten()},{status:400});
  const {id}=await params; await db.update(physicalCards).set({gradingStatus:parsed.data.status,updatedAt:new Date()}).where(eq(physicalCards.id,id));
  return NextResponse.json({ok:true});
}
