import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { eq } from "drizzle-orm";
import { mediaAssets, physicalCards } from "@/db/schema";
import { getSupabaseAdmin } from "@/lib/supabase";
import { webAuthorized } from "@/lib/web-auth";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const videoTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const captureTypes = ["front", "back", "centering", "front_surface", "back_surface", "top_edge", "bottom_edge", "left_edge", "right_edge", "corner_macro", "defect_macro", "other"] as const;

const bodySchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1).transform((value) => value.toLowerCase()),
  byteSize: z.number().int().positive(),
  kind: z.enum(["image", "video", "centering"]),
  captureType: z.enum(captureTypes),
});

function clean(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!webAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb(); const supabase = getSupabaseAdmin();
  if (!db || !supabase) return NextResponse.json({ error: "Database/storage not configured." }, { status: 503 });
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return NextResponse.json({ error: "Storage URL is not configured." }, { status: 503 });
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const allowedType = body.kind === "video" ? videoTypes.has(body.contentType) : imageTypes.has(body.contentType);
  const sizeLimit = body.kind === "video" ? 250 * 1024 * 1024 : 25 * 1024 * 1024;
  if (!allowedType) return NextResponse.json({ error: "Unsupported media type." }, { status: 415 });
  if (body.byteSize > sizeLimit) return NextResponse.json({ error: "File exceeds the upload size limit." }, { status: 413 });
  if (body.captureType === "centering" && body.kind !== "centering") return NextResponse.json({ error: "Centering media must be an image." }, { status: 400 });
  if (body.kind === "video" && ["front", "back", "centering"].includes(body.captureType)) return NextResponse.json({ error: "Use a sweep, edge, macro, or Other category for video." }, { status: 400 });
  const [card] = await db.select({ id: physicalCards.id }).from(physicalCards).where(eq(physicalCards.id, id)).limit(1);
  if (!card) return NextResponse.json({ error: "Physical card not found." }, { status: 404 });
  const bucket = process.env.MEDIA_BUCKET || "grading-media";
  const folder = body.kind === "video" ? "videos" : "photos";
  const path = `cards/${id}/${folder}/${crypto.randomUUID()}-${clean(body.filename)}`;
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message || "Unable to sign upload." }, { status: 500 });
  const [asset] = await db.insert(mediaAssets).values({
    physicalCardId: id,
    kind: body.kind,
    captureType: body.captureType,
    storagePath: path,
    originalFilename: body.filename,
    mimeType: body.contentType,
    byteSize: body.byteSize,
    processingStatus: "uploading",
    selectedForGrading: body.kind !== "video",
  }).returning({ id: mediaAssets.id });
  const projectId = new URL(supabaseUrl).hostname.split(".")[0];
  const tusEndpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
  return NextResponse.json({ mediaAssetId: asset.id, bucket, path, token: data.token, signedUrl: data.signedUrl, tusEndpoint });
}
