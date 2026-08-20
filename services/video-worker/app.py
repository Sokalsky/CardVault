from __future__ import annotations

import io
import hmac
import math
import os
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any
from uuid import UUID

import cv2
import imagehash
import numpy as np
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from PIL import Image, ImageDraw, ImageOps
from pydantic import BaseModel, ConfigDict, Field
from supabase import create_client

app = FastAPI(title="CardVault Video Worker", version="1.0.0")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = os.environ.get("MEDIA_BUCKET", "grading-media")
WORKER_SECRET = os.environ.get("VIDEO_WORKER_SECRET", "")
DEFAULT_FPS = float(os.environ.get("FRAME_SAMPLE_FPS", "4"))
DEFAULT_MAX_FRAMES = int(os.environ.get("MAX_RETAINED_FRAMES", "12"))
MAX_VIDEO_BYTES = int(os.environ.get("MAX_VIDEO_BYTES", str(250 * 1024 * 1024)))
MAX_JOB_ATTEMPTS = int(os.environ.get("MAX_JOB_ATTEMPTS", "3"))
QUEUE_POLL_SECONDS = float(os.environ.get("QUEUE_POLL_SECONDS", "5"))
_active_jobs: set[str] = set()
_active_lock = threading.Lock()
_poller_started = False


class ProcessRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    job_id: UUID = Field(alias="jobId")
    media_asset_id: UUID = Field(alias="mediaAssetId")
    physical_card_id: UUID = Field(alias="physicalCardId")
    storage_path: str = Field(alias="storagePath", min_length=1, max_length=1000)
    capture_type: str = Field(default="video_sweep", alias="captureType", min_length=1, max_length=100)
    fps: float = Field(default=DEFAULT_FPS, ge=0.5, le=10)
    max_frames: int = Field(default=DEFAULT_MAX_FRAMES, alias="maxFrames", ge=1, le=24)


def sb():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Supabase environment variables are missing")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def sharpness(path: Path) -> float:
    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        return 0.0
    return float(cv2.Laplacian(image, cv2.CV_64F).var())


def exposure_score(path: Path) -> float:
    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        return 0.0
    mean = float(image.mean())
    brightness = max(0.0, 1.0 - abs(mean - 127.5) / 127.5)
    clipped = float(np.mean((image <= 5) | (image >= 250)))
    return max(0.0, min(1.0, brightness * (1.0 - min(clipped * 2.0, 0.8))))


def overall_score(sharp: float, exposure: float) -> float:
    # Log scaling prevents a few extremely sharp frames from dominating exposure quality.
    return math.log1p(max(sharp, 0.0)) * (0.6 + 0.4 * exposure)


def perceptual_hash(path: Path):
    with Image.open(path) as image:
        return imagehash.phash(image.convert("RGB"))


def make_contact_sheet(paths: list[Path]) -> bytes:
    thumbs: list[Image.Image] = []
    for path in paths:
        with Image.open(path) as image:
            thumb = ImageOps.contain(image.convert("RGB"), (420, 560))
            canvas = Image.new("RGB", (440, 590), "white")
            canvas.paste(thumb, ((440 - thumb.width) // 2, 10))
            ImageDraw.Draw(canvas).text((12, 568), path.stem, fill="black")
            thumbs.append(canvas)
    cols = 4
    rows = max(1, math.ceil(len(thumbs) / cols))
    sheet = Image.new("RGB", (cols * 440, rows * 590), "white")
    for index, thumb in enumerate(thumbs):
        sheet.paste(thumb, ((index % cols) * 440, (index // cols) * 590))
    buffer = io.BytesIO()
    sheet.save(buffer, "JPEG", quality=88, optimize=True)
    return buffer.getvalue()


def update_job(client: Any, job_id: str, **fields: Any) -> None:
    client.table("processing_jobs").update(fields).eq("id", job_id).execute()


def fail_job(client: Any, request: ProcessRequest, message: str) -> None:
    job_rows = client.table("processing_jobs").select("attempts").eq("id", str(request.job_id)).limit(1).execute().data or []
    attempts = int(job_rows[0].get("attempts") or 0) if job_rows else MAX_JOB_ATTEMPTS
    retrying = attempts < MAX_JOB_ATTEMPTS
    client.table("media_assets").update({"processing_status": "queued" if retrying else "failed"}).eq("id", str(request.media_asset_id)).execute()
    update_job(client, str(request.job_id), status="queued" if retrying else "failed", error=message[:2000])


@app.get("/health")
def health():
    executable = shutil.which("ffmpeg")
    ffmpeg_version = None
    if executable:
        try:
            ffmpeg_version = subprocess.run(
                [executable, "-version"], capture_output=True, text=True, timeout=5, check=True
            ).stdout.splitlines()[0]
        except Exception:
            executable = None
    ok = bool(executable)
    return JSONResponse(
        {
            "ok": ok,
            "service": "cardvault-video-worker",
            "ffmpeg": ffmpeg_version,
            "opencv": cv2.__version__,
            "configured": {
                "supabase": bool(SUPABASE_URL and SUPABASE_KEY),
                "workerAuth": bool(WORKER_SECRET),
                "queuePoller": _poller_started,
            },
            "limits": {"defaultRetainedFrames": DEFAULT_MAX_FRAMES, "maxRetainedFrames": 24},
        },
        status_code=200 if ok else 503,
    )


def process_video(request: ProcessRequest):
    client = sb()
    media_id = str(request.media_asset_id)
    card_id = str(request.physical_card_id)
    job_id = str(request.job_id)

    media_rows = client.table("media_assets").select("id,physical_card_id,storage_path,kind").eq("id", media_id).limit(1).execute().data
    if not media_rows:
        raise HTTPException(status_code=404, detail="Media asset not found")
    media = media_rows[0]
    if media["kind"] != "video" or media["physical_card_id"] != card_id or media["storage_path"] != request.storage_path:
        raise HTTPException(status_code=409, detail="Media asset does not match the requested physical card and storage path")
    job_rows = client.table("processing_jobs").select("id,media_asset_id,physical_card_id,attempts").eq("id", job_id).limit(1).execute().data
    if not job_rows or job_rows[0]["media_asset_id"] != media_id or job_rows[0]["physical_card_id"] != card_id:
        raise HTTPException(status_code=409, detail="Processing job does not match the media asset")
    update_job(client, job_id, status="processing", attempts=int(job_rows[0].get("attempts") or 0) + 1, error=None)
    client.table("media_assets").update({"processing_status": "processing"}).eq("id", media_id).execute()

    try:
        raw = client.storage.from_(BUCKET).download(request.storage_path)
        if len(raw) > MAX_VIDEO_BYTES:
            raise ValueError("Source video exceeds the configured worker size limit")

        with tempfile.TemporaryDirectory() as temp:
            temp_dir = Path(temp)
            video = temp_dir / "input-video"
            video.write_bytes(raw)
            frame_pattern = temp_dir / "frame-%05d.jpg"
            subprocess.run(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-t", "30", "-i", str(video),
                    "-vf", f"fps={request.fps}", "-q:v", "2", str(frame_pattern),
                ],
                check=True,
                timeout=120,
            )

            old_frames = client.table("extracted_frames").select("storage_path").eq("media_asset_id", media_id).execute().data or []
            if old_frames:
                client.storage.from_(BUCKET).remove([row["storage_path"] for row in old_frames])
            client.table("extracted_frames").delete().eq("media_asset_id", media_id).execute()

            frame_paths = sorted(temp_dir.glob("frame-*.jpg"))
            if not frame_paths:
                raise ValueError("No frames were extracted")

            candidates: list[dict[str, Any]] = []
            for index, path in enumerate(frame_paths):
                try:
                    sharp = sharpness(path)
                    exposure = exposure_score(path)
                    candidates.append({
                        "path": path,
                        "sharp": sharp,
                        "exposure": exposure,
                        "score": overall_score(sharp, exposure),
                        "hash": perceptual_hash(path),
                        "timestamp": round(index * 1000 / request.fps),
                    })
                except Exception:
                    continue
            candidates.sort(key=lambda candidate: candidate["score"], reverse=True)

            chosen: list[dict[str, Any]] = []
            for candidate in candidates:
                if any(candidate["hash"] - prior["hash"] < 6 for prior in chosen):
                    continue
                chosen.append(candidate)
                if len(chosen) >= request.max_frames:
                    break
            chosen.sort(key=lambda candidate: candidate["timestamp"])
            if not chosen:
                raise ValueError("No usable distinct frames remained after scoring")

            inserted: list[dict[str, Any]] = []
            for order, candidate in enumerate(chosen, start=1):
                filename = f"{order:02d}-{candidate['timestamp']:06d}ms.jpg"
                storage_path = f"cards/{card_id}/frames/{media_id}/{filename}"
                data = candidate["path"].read_bytes()
                client.storage.from_(BUCKET).upload(storage_path, data, {"content-type": "image/jpeg", "upsert": "true"})
                payload = {
                    "media_asset_id": media_id,
                    "physical_card_id": card_id,
                    "storage_path": storage_path,
                    "timestamp_ms": candidate["timestamp"],
                    "sharpness_score": candidate["sharp"],
                    "exposure_score": candidate["exposure"],
                    "overall_score": candidate["score"],
                    "perceptual_hash": str(candidate["hash"]),
                    "selected_for_grading": True,
                }
                rows = client.table("extracted_frames").insert(payload).execute().data
                if rows:
                    inserted.append(rows[0])

            contact_type = f"{request.capture_type}_contact_sheet"
            contact_path = f"cards/{card_id}/contact-sheets/{media_id}.jpg"
            old_contacts = client.table("media_assets").select("id,storage_path").eq("physical_card_id", card_id).eq("kind", "contact_sheet").eq("storage_path", contact_path).execute().data or []
            if old_contacts:
                client.storage.from_(BUCKET).remove([row["storage_path"] for row in old_contacts])
                client.table("media_assets").delete().eq("physical_card_id", card_id).eq("kind", "contact_sheet").eq("storage_path", contact_path).execute()
            contact = make_contact_sheet([candidate["path"] for candidate in chosen])
            client.storage.from_(BUCKET).upload(contact_path, contact, {"content-type": "image/jpeg", "upsert": "true"})
            client.table("media_assets").insert({
                "physical_card_id": card_id,
                "kind": "contact_sheet",
                "capture_type": contact_type,
                "storage_path": contact_path,
                "original_filename": f"{media_id}-contact-sheet.jpg",
                "mime_type": "image/jpeg",
                "byte_size": len(contact),
                "processing_status": "ready",
                "selected_for_grading": False,
            }).execute()

        client.table("media_assets").update({"processing_status": "ready", "selected_for_grading": False}).eq("id", media_id).execute()
        update_job(client, job_id, status="completed", error=None)
        return {"ok": True, "jobId": job_id, "sourceFrames": len(frame_paths), "selectedFrames": len(inserted), "frames": inserted}
    except HTTPException:
        raise
    except Exception as exc:
        fail_job(client, request, str(exc))
        raise HTTPException(status_code=500, detail=f"Video processing failed: {exc}") from exc


def claim_local(job_id: str) -> bool:
    with _active_lock:
        if job_id in _active_jobs:
            return False
        _active_jobs.add(job_id)
        return True


def run_claimed(request: ProcessRequest) -> None:
    job_id = str(request.job_id)
    try:
        process_video(request)
    except Exception as exc:
        print(f"Video job {job_id} attempt failed: {exc}", flush=True)
    finally:
        with _active_lock:
            _active_jobs.discard(job_id)


def queued_request(client: Any, job: dict[str, Any]) -> ProcessRequest | None:
    media_rows = client.table("media_assets").select(
        "id,physical_card_id,storage_path,capture_type,kind"
    ).eq("id", job["media_asset_id"]).limit(1).execute().data or []
    if not media_rows:
        update_job(client, job["id"], status="failed", error="Queued media asset no longer exists")
        return None
    media = media_rows[0]
    if media["kind"] != "video" or media["physical_card_id"] != job["physical_card_id"]:
        update_job(client, job["id"], status="failed", error="Queued media asset does not match the physical card")
        return None
    return ProcessRequest.model_validate({
        "jobId": job["id"],
        "mediaAssetId": media["id"],
        "physicalCardId": media["physical_card_id"],
        "storagePath": media["storage_path"],
        "captureType": media.get("capture_type") or "video_sweep",
    })


def poll_queue() -> None:
    while True:
        try:
            client = sb()
            jobs = client.table("processing_jobs").select(
                "id,media_asset_id,physical_card_id,attempts"
            ).eq("kind", "video_frame_extraction").in_("status", ["queued", "processing"]).lt(
                "attempts", MAX_JOB_ATTEMPTS
            ).order("created_at").limit(3).execute().data or []
            for job in jobs:
                job_id = str(job["id"])
                if not claim_local(job_id):
                    continue
                request = queued_request(client, job)
                if request is None:
                    with _active_lock:
                        _active_jobs.discard(job_id)
                    continue
                run_claimed(request)
        except Exception as exc:
            print(f"Video queue poll failed: {exc}", flush=True)
        time.sleep(max(QUEUE_POLL_SECONDS, 1.0))


@app.on_event("startup")
def start_queue_poller() -> None:
    global _poller_started
    if _poller_started or not SUPABASE_URL or not SUPABASE_KEY:
        return
    threading.Thread(target=poll_queue, name="cardvault-video-queue", daemon=True).start()
    _poller_started = True


@app.post("/process", status_code=202)
def process(request: ProcessRequest, background_tasks: BackgroundTasks, x_worker_secret: str | None = Header(default=None)):
    if not WORKER_SECRET:
        raise HTTPException(status_code=503, detail="VIDEO_WORKER_SECRET is not configured")
    if not x_worker_secret or not hmac.compare_digest(x_worker_secret, WORKER_SECRET):
        raise HTTPException(status_code=401, detail="Invalid worker secret")
    job_id = str(request.job_id)
    if claim_local(job_id):
        background_tasks.add_task(run_claimed, request)
    return {"ok": True, "queued": True, "jobId": job_id}
