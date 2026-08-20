import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { mediaAssets, physicalCards } from "@/db/schema";
import { webAuthorized } from "@/lib/web-auth";
import { assessMediaReadiness } from "@/lib/media-readiness";
const schema=z.object({status:z.enum(["needs_photos","ready_for_grading","grading","needs_more_photos","graded","recheck","grade_candidate","do_not_grade","submitted_to_psa","psa_returned","ungraded"])});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  if(!webAuthorized(req)) return NextResponse.json({error:"Unauthorized"},{status:401});
  const db=getDb(); if(!db) return NextResponse.json({error:"Database not configured"},{status:503});
  const parsed=schema.safeParse(await req.json()); if(!parsed.success) return NextResponse.json({error:parsed.error.flatten()},{status:400});
  const {id}=await params;
  if(parsed.data.status==="ready_for_grading"){
    const media=await db.select({kind:mediaAssets.kind,captureType:mediaAssets.captureType,processingStatus:mediaAssets.processingStatus,selectedForGrading:mediaAssets.selectedForGrading}).from(mediaAssets).where(eq(mediaAssets.physicalCardId,id));
    const readiness=assessMediaReadiness(media);
    if(!readiness.ready) return NextResponse.json({error:`Card is not ready: ${readiness.reasons.join("; ")}.`,readiness},{status:409});
  }
  const updated=await db.update(physicalCards).set({gradingStatus:parsed.data.status,updatedAt:new Date()}).where(eq(physicalCards.id,id)).returning({id:physicalCards.id});
  if(!updated.length) return NextResponse.json({error:"Physical card not found"},{status:404});
  return NextResponse.json({ok:true});
}
