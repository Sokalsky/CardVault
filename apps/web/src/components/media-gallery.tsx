/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { MediaForGrading } from "@/lib/types";

export function MediaGallery({ media, disabled }: { media: MediaForGrading[]; disabled?: boolean }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(item: MediaForGrading) {
    if (disabled) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/media/${item.id}/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selected: !item.selectedForGrading }),
      });
      if (!res.ok) throw new Error(await res.text());
      window.location.reload();
    } finally {
      setBusyId(null);
    }
  }

  if (!media.length) return <div className="empty">No stored media yet. Existing chat photos can be imported with the included archive importer.</div>;

  return (
    <div className="media-grid">
      {media.map((item) => (
        <div className="media-tile" key={item.id}>
          <div className="media-box">
            {item.signedUrl && item.kind === "video" ? (
              <video src={item.signedUrl} controls playsInline preload="metadata" />
            ) : item.signedUrl ? (
              <img src={item.signedUrl} alt={`${item.captureType} grading media`} />
            ) : (
              <span>{item.captureType}</span>
            )}
          </div>
          <div className="media-meta">
            <div>
              <div className="row-title">{item.captureType.replaceAll("_", " ")}</div>
              <div className="row-sub">{item.kind}{item.timestampMs != null ? ` · ${item.timestampMs}ms` : ""}{item.processingStatus ? ` · ${item.processingStatus}` : ""}</div>
            </div>
            <button className={`btn small ${item.selectedForGrading ? "primary" : ""}`} disabled={disabled || busyId === item.id || item.kind === "video"} onClick={() => void toggle(item)}>
              {item.selectedForGrading ? "Included" : "Include"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
