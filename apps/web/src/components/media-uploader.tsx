"use client";

import { useState } from "react";
import * as tus from "tus-js-client";
import { Images, Video } from "lucide-react";
import { inferredCaptureType } from "@/lib/media-capture";
import { mediaFileInfo } from "@/lib/media-file";
import { requireSignedUploadJws, signedStandardHeaders, signedTusHeaders } from "@/lib/signed-upload";

type TusFailure = Error & { originalResponse?: { getBody?: () => string; getStatus?: () => number } };

function failureMessage(error: unknown) {
  if (!(error instanceof Error)) return "Unknown upload error";
  const tusError = error as TusFailure;
  const responseBody = tusError.originalResponse?.getBody?.();
  const responseStatus = tusError.originalResponse?.getStatus?.();
  return [error.message, responseStatus ? `HTTP ${responseStatus}` : "", responseBody || ""].filter(Boolean).join(" — ");
}

export function MediaUploader({ cardId, disabled }: { cardId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadOne(file: File, captureType: string, position: number, total: number) {
    const { contentType, isVideo } = mediaFileInfo(file);
    if (!contentType) throw new Error(`${file.name} is not a supported photo or video.`);
    const kind = isVideo ? "video" : captureType === "centering" ? "centering" : "image";
    setMessage(`Preparing ${position} of ${total}: ${file.name}`);
    const response = await fetch(`/api/cards/${cardId}/media/sign-upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType, byteSize: file.size, kind, captureType }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    if (data.alreadyUploaded) {
      setMessage(`Already saved ${position} of ${total}: ${file.name}`);
      return;
    }
    const mediaAssetId = String(data.mediaAssetId || "");
    const signedUrl = String(data.signedUrl || "");
    const tusEndpoint = String(data.tusEndpoint || "");
    if (!mediaAssetId || !signedUrl || !tusEndpoint) throw new Error("The server did not provide a complete signed storage destination.");

    let stage = "signed upload validation";
    try {
      // Supabase pre-signed uploads authenticate with x-signature. Authorization
      // is deliberately absent: CardVault has no browser Supabase Auth session,
      // and public/service keys must never be substituted for a user JWT.
      const signedUploadToken = requireSignedUploadJws(data.token);
      stage = "storage upload";
      if (kind === "video" || file.size > 6 * 1024 * 1024) {
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: tusEndpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: signedTusHeaders(signedUploadToken, Boolean(data.upsert)),
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: data.bucket,
            objectName: data.path,
            contentType,
            cacheControl: "3600",
          },
          chunkSize: 6 * 1024 * 1024,
          onError: reject,
          onProgress: (sent, bytes) => setMessage(`Uploading ${position} of ${total}: ${Math.round((sent / bytes) * 100)}%`),
          onSuccess: () => resolve(),
        });
        void upload.findPreviousUploads()
          .then((previous) => {
            if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
            upload.start();
          })
          .catch(() => upload.start());
      });
      } else {
        setMessage(`Uploading ${position} of ${total}: ${file.name}`);
        const body = new FormData();
        body.append("cacheControl", "3600");
        body.append("", file.type ? file : new File([file], file.name, { type: contentType, lastModified: file.lastModified }));
        const uploadResponse = await fetch(signedUrl, {
          method: "PUT",
          headers: signedStandardHeaders(Boolean(data.upsert)),
          body,
        });
        if (!uploadResponse.ok) throw new Error(`${uploadResponse.status} ${await uploadResponse.text()}`);
      }

      stage = kind === "video" ? "video processing" : "photo completion";
      setMessage(kind === "video" ? `Processing video ${position} of ${total}…` : `Saving photo ${position} of ${total}…`);
      const complete = await fetch(`/api/media/${mediaAssetId}/complete`, { method: "POST" });
      if (!complete.ok) throw new Error(`${complete.status} ${await complete.text()}`);
      if (kind === "video") await waitForVideo(mediaAssetId, position, total);
    } catch (error) {
      const reason = failureMessage(error);
      await fetch(`/api/media/${mediaAssetId}/failed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, error: reason.slice(0, 2000) }),
      }).catch(() => undefined);
      throw new Error(`${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB) failed during ${stage}: ${reason}`);
    }
  }

  async function waitForVideo(mediaAssetId: string, position: number, total: number) {
    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      setMessage(`Processing video ${position} of ${total}…`);
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      const response = await fetch(`/api/media/${mediaAssetId}/complete`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      const state = await response.json();
      if (state.processingStatus === "ready") return;
      if (state.processingStatus === "failed" || state.jobStatus === "failed") {
        throw new Error(state.error || "Video frame extraction failed.");
      }
    }
    throw new Error("Video processing did not finish within five minutes. It can be retried without uploading the video again.");
  }

  async function uploadAll(selected: FileList) {
    if (disabled || busy) return;
    const files = Array.from(selected);
    if (!files.length) return;
    if (files.length > 40) {
      setMessage("Choose no more than 40 files for one card.");
      return;
    }
    setBusy(true);
    let photoIndex = 0;
    const failures: string[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const currentPhotoIndex = mediaFileInfo(file).isVideo ? -1 : photoIndex++;
        try {
          await uploadOne(file, inferredCaptureType(file, currentPhotoIndex), index + 1, files.length);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `${file.name} failed`);
        }
      }
      if (failures.length) {
        setMessage(`${files.length - failures.length} of ${files.length} files finished. ${failures.length} failed: ${failures.join(" | ")}`);
        return;
      }
      setMessage("Uploads complete. Sending this card to the grading queue…");
      const status = await fetch(`/api/cards/${cardId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "ready_for_grading" }),
      });
      if (!status.ok) throw new Error(await status.text());
      setMessage(`${files.length} files saved. Card is ready for grading.`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(error instanceof Error ? `Upload stopped: ${error.message}` : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-zone">
      <label className={`btn ${disabled ? "" : "primary"}`} style={{ justifyContent: "center", width: "100%" }}>
        <Images size={17} /> {busy ? "Uploading and processing…" : "Choose all photos & videos"}
        <input
          type="file"
          accept="image/*,video/*,.heic,.heif,.mov,.m4v"
          multiple
          hidden
          disabled={disabled || busy}
          onChange={(event) => {
            if (event.target.files) void uploadAll(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <div className="upload-help">
        <Images size={13} style={{ verticalAlign: "-2px" }} /> Select the front first and back second, then every remaining photo. {" "}
        <Video size={13} style={{ verticalAlign: "-2px" }} /> Add all short surface/edge videos in the same selection. Videos are converted into grading frames automatically.
      </div>
      <div className="upload-help">When every file and video finishes processing, the card is marked Ready for Grading. You can also reselect only a failed file to retry it.</div>
      {disabled && <div className="upload-help">Uploads require the connected production database and storage.</div>}
      {message && <div className="upload-help" aria-live="polite">{message}</div>}
    </div>
  );
}
