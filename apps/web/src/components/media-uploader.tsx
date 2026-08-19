"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";
import { UploadCloud, Video, Image as ImageIcon } from "lucide-react";

const captureTypes = [
  ["front", "Front photo"], ["back", "Back photo"], ["centering", "Centering screenshot"],
  ["front_surface", "Front surface sweep"], ["back_surface", "Back surface sweep"],
  ["top_edge", "Top edge sweep"], ["bottom_edge", "Bottom edge sweep"],
  ["left_edge", "Left edge sweep"], ["right_edge", "Right edge sweep"],
  ["corner_macro", "Corner macro"], ["defect_macro", "Defect close-up"], ["other", "Other"],
];

export function MediaUploader({ cardId, disabled }: { cardId: string; disabled?: boolean }) {
  const [captureType, setCaptureType] = useState("front");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    if (disabled) return;
    setBusy(true); setMessage("Preparing upload…");
    try {
      const kind = file.type.startsWith("video/") ? "video" : captureType === "centering" ? "centering" : "image";
      const res = await fetch(`/api/cards/${cardId}/media/sign-upload`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, byteSize: file.size, kind, captureType }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anon) throw new Error("Missing public Supabase environment variables.");
      const supabase = createClient(url, anon);
      setMessage("Uploading…");
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
            metadata: { bucketName: data.bucket, objectName: data.path, contentType: file.type || "application/octet-stream", cacheControl: "3600" },
            chunkSize: 6 * 1024 * 1024,
            onError: reject,
            onProgress: (sent, total) => setMessage(`Uploading… ${Math.round((sent / total) * 100)}%`),
            onSuccess: () => resolve(),
          });
          void upload.findPreviousUploads().then((previous) => { if (previous.length) upload.resumeFromPreviousUpload(previous[0]); upload.start(); });
        });
      } else {
        const { error } = await supabase.storage.from(data.bucket).uploadToSignedUrl(data.path, data.token, file, { contentType: file.type });
        if (error) throw error;
      }
      setMessage(kind === "video" ? "Uploaded. Starting frame extraction…" : "Uploaded.");
      const complete = await fetch(`/api/media/${data.mediaAssetId}/complete`, { method: "POST" });
      if (!complete.ok) throw new Error(await complete.text());
      setMessage(kind === "video" ? "Video queued for frame extraction." : "Photo saved.");
      window.setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  return (
    <div className="upload-zone">
      <div className="upload-grid">
        <label>
          <div className="grade-label" style={{ marginBottom: 6 }}>Media type</div>
          <select className="select" style={{ width: "100%" }} value={captureType} onChange={(e) => setCaptureType(e.target.value)} disabled={disabled || busy}>
            {captureTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label className={`btn ${disabled ? "" : "primary"}`} style={{ justifyContent: "center" }}>
          <UploadCloud size={16} /> {busy ? "Working…" : "Choose photo or video"}
          <input type="file" accept="image/*,video/*" hidden disabled={disabled || busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ""; }} />
        </label>
      </div>
      <div className="upload-help">
        <ImageIcon size={13} style={{ verticalAlign: "-2px" }} /> Upload straight front/back photos and centering screenshots. {" "}
        <Video size={13} style={{ verticalAlign: "-2px" }} /> Short surface/edge videos are stored, then the FFmpeg worker extracts sharp still frames automatically.
      </div>
      {disabled && <div className="upload-help">Uploads are disabled in demo mode. Add Supabase + database environment variables to enable them.</div>}
      {message && <div className="upload-help" aria-live="polite">{message}</div>}
    </div>
  );
}
