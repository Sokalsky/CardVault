/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { MediaForGrading } from "@/lib/types";

export function MediaGallery({ media, disabled }: { media: MediaForGrading[]; disabled?: boolean }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const frames = media.filter((item) => Boolean(item.sourceMediaAssetId));
  const videos = media.filter((item) => item.kind === "video");
  const photos = media.filter((item) => !item.sourceMediaAssetId && item.kind !== "video" && item.kind !== "contact_sheet");
  const derived = media.filter((item) => item.kind === "contact_sheet");
  const selected = media.filter((item) => item.selectedForGrading).length;
  const incomplete = media.some((item) => !item.sourceMediaAssetId && !["ready"].includes(item.processingStatus || ""));

  async function toggle(item: MediaForGrading) {
    if (disabled || item.processingStatus !== "ready") return;
    setBusyId(item.id);
    setMessage("");
    try {
      const res = await fetch(`/api/media/${item.id}/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selected: !item.selectedForGrading }),
      });
      if (!res.ok) throw new Error(await res.text());
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Media selection failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function retryVideo(item: MediaForGrading) {
    setBusyId(item.id);
    setMessage(`Queueing ${item.originalFilename || "video"}…`);
    try {
      const response = await fetch(`/api/media/${item.id}/complete`, { method: "POST" });
      if (!response.ok) throw new Error(await response.text());
      setMessage("Video queued. Frame extraction is running; this page will refresh.");
      window.setTimeout(() => window.location.reload(), 2500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Video processing could not be retried.");
    } finally {
      setBusyId(null);
    }
  }

  function renderItem(item: MediaForGrading) {
    const processingRetry = item.kind === "video"
      && (item.processingStatus === "uploaded_unprocessed" || (item.processingStatus === "failed" && item.jobKind === "video_frame_extraction"));
    const canSelect = item.kind !== "video" && item.kind !== "contact_sheet" && item.processingStatus === "ready";
    return <div className="media-tile" key={item.id}>
      <div className="media-box">
        {item.signedUrl && item.kind === "video" ? <video src={item.signedUrl} controls playsInline preload="metadata" />
          : item.signedUrl ? <img src={item.signedUrl} alt={`${item.captureType} grading media`} />
          : <span>{item.processingStatus || item.captureType}</span>}
      </div>
      <div className="media-meta">
        <div style={{minWidth:0}}>
          <div className="row-title" style={{overflowWrap:"anywhere"}}>{item.originalFilename || item.captureType.replaceAll("_", " ")}</div>
          <div className="row-sub">
            {item.captureType.replaceAll("_", " ")}{item.timestampMs != null ? ` · ${(item.timestampMs / 1000).toFixed(2)}s` : ""} · {item.processingStatus || "unknown"}
            {item.kind === "video" ? ` · ${item.frameCount || 0} frames` : ""}
          </div>
          {item.error && <div className="row-sub" style={{color:"#ff9b91",marginTop:4}}>{item.error}</div>}
          {item.kind === "video" && item.processingStatus === "uploading" && <div className="row-sub" style={{marginTop:4}}>Reselect this video below to resume or retry its upload.</div>}
        </div>
        {processingRetry ? <button className="btn small" disabled={disabled || busyId === item.id} onClick={() => void retryVideo(item)}>Retry processing</button>
          : <button className={`btn small ${item.selectedForGrading ? "primary" : ""}`} disabled={disabled || busyId === item.id || !canSelect} onClick={() => void toggle(item)}>
            {item.selectedForGrading ? "Included" : "Include"}
          </button>}
      </div>
    </div>;
  }

  function section(title: string, items: MediaForGrading[]) {
    return <section style={{marginTop:18}}>
      <div className="grade-label" style={{marginBottom:8}}>{title} · {items.length}</div>
      {items.length ? <div className="media-grid">{items.map(renderItem)}</div> : <div className="empty">None yet.</div>}
    </section>;
  }

  if (!media.length) return <div className="empty">No grading media stored yet. Choose the front, back, additional photos, and videos below.</div>;

  return <div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <span className="badge">Photos: {photos.length}</span>
      <span className="badge">Videos: {videos.length}</span>
      <span className="badge">Extracted frames: {frames.length}</span>
      <span className="badge good">Selected: {selected}</span>
    </div>
    {incomplete && <div className="callout" style={{marginTop:12}}>
      Incomplete upload records were found. Reselect a failed local file to retry it. Removing stale placeholders is an administrator-reviewed maintenance action and is never performed by this page.
    </div>}
    {section("Original photos", photos)}
    {section("Original videos", videos)}
    {section("Extracted video frames", frames)}
    {derived.length > 0 && section("Contact sheets", derived)}
    {message && <div className="upload-help" aria-live="polite" style={{marginTop:10}}>{message}</div>}
  </div>;
}
