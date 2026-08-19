"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";
import { Images, Video } from "lucide-react";
import { inferredCaptureType } from "@/lib/media-capture";

export function MediaUploader({ cardId, disabled }: { cardId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadOne(file: File, captureType: string, position: number, total: number) {
    const kind = file.type.startsWith("video/") ? "video" : captureType === "centering" ? "centering" : "image";
    setMessage(`Preparing ${position} of ${total}: ${file.name}`);
    const response = await fetch(`/api/cards/${cardId}/media/sign-upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, byteSize: file.size, kind, captureType }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error("Missing public Supabase environment variables.");
    const supabase = createClient(url, anon);

    if (kind === "video" || file.size > 6 * 1024 * 1024) {
      const projectId = new URL(url).hostname.split(".")[0];
      const endpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: { authorization: `Bearer ${anon}`, "x-signature": data.token },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: data.bucket,
            objectName: data.path,
            contentType: file.type || "application/octet-stream",
            cacheControl: "3600",
          },
          chunkSize: 6 * 1024 * 1024,
          onError: reject,
          onProgress: (sent, bytes) => setMessage(`Uploading ${position} of ${total}: ${Math.round((sent / bytes) * 100)}%`),
          onSuccess: () => resolve(),
        });
        void upload.findPreviousUploads().then((previous) => {
          if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        });
      });
    } else {
      setMessage(`Uploading ${position} of ${total}: ${file.name}`);
      const { error } = await supabase.storage.from(data.bucket).uploadToSignedUrl(data.path, data.token, file, {
        contentType: file.type,
      });
      if (error) throw error;
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
    if (files.filter((file) => !file.type.startsWith("video/")).length < 2) {
      setMessage("Include at least a front photo and a back photo in the batch.");
      return;
    }

    setBusy(true);
    let photoIndex = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const currentPhotoIndex = file.type.startsWith("video/") ? -1 : photoIndex++;
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
          accept="image/*,video/*"
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
