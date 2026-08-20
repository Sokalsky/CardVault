# Video capture and frame extraction

The worker does not use AI. It uses FFmpeg + OpenCV + perceptual hashing.

Recommended capture clips:

- Front surface sweep: 5–8 sec, slowly tilt under one strong light.
- Back surface sweep: 5–8 sec.
- Top / bottom / left / right edge: 3–5 sec each.
- Optional corner or suspected-defect macro.

Default worker behavior:

1. Download the original private video from Supabase Storage.
2. Extract at 4 frames/sec with FFmpeg.
3. Score sharpness using variance of the Laplacian and score exposure/clipping.
4. Remove near-duplicate frames using perceptual hash distance.
5. Retain up to 12 strong/unique stills (configurable from 1–24).
6. Upload selected JPEGs as `extracted_frames`, scoped to the same physical card and source video.
7. Generate a contact sheet for human review.
8. Mark the recoverable processing job complete, or retain its failure/attempt details. Failed jobs retry up to three times by default.
9. Keep the original video attached to the physical card, but do not send it to ChatGPT; ChatGPT receives user-selected stills.

The web API returns immediately after writing the durable job; the worker receives a notification and also polls queued/interrupted jobs so a web timeout or worker restart cannot strand a video. Completed jobs are not polled again. The worker rejects oversized/overlong inputs, enforces UUID and storage-path ownership, uses bounded FFmpeg timeouts, and requires the same `VIDEO_WORKER_SECRET` as the web service. Its `/health` endpoint reports actual FFmpeg/OpenCV availability, server configuration, and queue-poller state without exposing secrets.

`MAX_RETAINED_FRAMES` defaults to 12 and accepts up to 24. This is independent of the MCP image-content page size: every stored frame remains listed, and ChatGPT can request later image pages with `imageOffset`.

The worker is deliberately independent from OpenAI. Its only recurring cost is normal compute/storage/network usage on the hosting providers.
