"use client";

import { useState } from "react";
import * as tus from "tus-js-client";
import { Images, Video } from "lucide-react";
import { inferredCaptureType } from "@/lib/media-capture";
import { mediaFileInfo } from "@/lib/media-file";

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
    const signedUrl = String(data.signedUrl || "");
    const tusEndpoint = String(data.tusEndpoint || "");
    if (!signedUrl || !tusEndpoint) throw new Error("The server did not provide a signed storage destination.");

    if (kind === "video" || file.size > 6 * 1024 * 1024) {
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: tusEndpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: { "x-signature": data.token },
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
        headers: { "x-upsert": "false" },
        body,
      });
      if (!uploadResponse.ok) throw new Error(await uploadResponse.text());
    }

    setMessage(kind === "video" ? `Processing video ${position} of ${total}…` : `Saving photo ${position} of ${total}…`);
    const complete = await fetch(`/api/media/${data.mediaAssetId}/complete`, { method: "POST" });
    if (!complete.ok) throw new Error(await complete.text());
  }

  async function uploadAll(selected: FileList) {
    if (disabled || busy) return;
    const files = Array.from(selected);
    if (!files.length) return;
    if (files.length > 40) {
      setMessage("Choose no more than 40 files for one card.");
      return;
    }
    if (files.filter((file) => !mediaFileInfo(file).isVideo).length < 2) {
      setMessage("Include at least a front photo and a back photo in the batch.");
      return;
    }

    setBusy(true);
    let photoIndex = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const currentPhotoIndex = mediaFileInfo(file).isVideo ? -1 : photoIndex++;
        await uploadOne(file, inferredCaptureType(file, currentPhotoIndex), index + 1, files.length);
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
      <div className="upload-help">When every file finishes, the card is automatically marked Ready for Grading. You can still exclude weak frames afterward.</div>
      {disabled && <div className="upload-help">Uploads require the connected production database and storage.</div>}
      {message && <div className="upload-help" aria-live="polite">{message}</div>}
    </div>
  );
}
