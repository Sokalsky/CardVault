import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { cardPrintings, physicalCards } from "@/db/schema";
import { webAuthorized } from "@/lib/web-auth";

const schema=z.object({
  name:z.string().min(1), domain:z.enum(["pokemon","sports"]).default("pokemon"), cardNumber:z.string().optional().nullable(), setName:z.string().optional().nullable(), year:z.number().int().optional().nullable(), variant:z.string().optional().nullable(), category:z.string().optional().nullable(),
  copyLabel:z.string().default("1 of 1"), rawLow:z.number().optional().nullable(), rawHigh:z.number().optional().nullable(), rawMid:z.number().optional().nullable(), notes:z.string().optional().nullable(),
});
const n=(v?:number|null)=>v==null?null:String(v);

export async function POST(req:Request){
  if(!webAuthorized(req)) return NextResponse.json({error:"Unauthorized"},{status:401});
  const db=getDb(); if(!db) return NextResponse.json({error:"Database not configured"},{status:503});
  const parsed=schema.safeParse(await req.json()); if(!parsed.success) return NextResponse.json({error:parsed.error.flatten()},{status:400});
  const p=parsed.data; const variant=p.variant||null;
  const existing=await db.select({id:cardPrintings.id}).from(cardPrintings).where(and(eq(cardPrintings.domain,p.domain),eq(cardPrintings.name,p.name),p.cardNumber?eq(cardPrintings.cardNumber,p.cardNumber):isNull(cardPrintings.cardNumber),p.setName?eq(cardPrintings.setName,p.setName):isNull(cardPrintings.setName),variant?eq(cardPrintings.variant,variant):isNull(cardPrintings.variant))).limit(1);
  let printingId=existing[0]?.id;
  if(!printingId){const [printing]=await db.insert(cardPrintings).values({name:p.name,domain:p.domain,cardNumber:p.cardNumber,setName:p.setName,year:p.year,variant,category:p.category}).returning({id:cardPrintings.id}); printingId=printing.id;}
  const copyNumber=Number((p.copyLabel.match(/^(\d+)/)||[])[1]||1);
  const [card]=await db.insert(physicalCards).values({cardPrintingId:printingId,copyLabel:p.copyLabel,copyNumber,rawLow:n(p.rawLow),rawHigh:n(p.rawHigh),rawMid:n(p.rawMid),asIsLow:n(p.rawLow),asIsHigh:n(p.rawHigh),asIsMid:n(p.rawMid),notes:p.notes,gradingStatus:"needs_photos"}).returning({id:physicalCards.id});
  return NextResponse.json({ok:true,id:card.id});
}
