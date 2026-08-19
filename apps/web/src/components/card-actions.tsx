"use client";

import { useState } from "react";

export function CardActions({ cardId, status, disabled }: { cardId: string; status: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function setStatus(next: string) {
    if (disabled) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/cards/${cardId}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) });
      if (!res.ok) throw new Error(await res.text());
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status update failed.");
    } finally { setBusy(false); }
  }
  return <div style={{display:"grid",gap:6,justifyItems:"end"}}><div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
    <button className="btn primary" disabled={disabled||busy||status==="ready_for_grading"} onClick={()=>void setStatus("ready_for_grading")}>Mark ready for grading</button>
    <button className="btn" disabled={disabled||busy} onClick={()=>void setStatus("needs_more_photos")}>Needs more photos</button>
    <button className="btn" disabled={disabled||busy} onClick={()=>void setStatus("recheck")}>Recheck</button>
    <button className="btn" disabled={disabled||busy} onClick={()=>void setStatus("do_not_grade")}>Do not grade</button>
  </div>{error && <span className="row-sub" role="alert">{error}</span>}</div>;
}
