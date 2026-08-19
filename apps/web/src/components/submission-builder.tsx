"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import type { CardListItem } from "@/lib/types";

export function SubmissionBuilder({ candidates, disabled }: { candidates: CardListItem[]; disabled: boolean }) {
  const [selected, setSelected] = useState(() => new Set(candidates.map((card) => card.id)));
  const [name, setName] = useState(`PSA draft ${new Date().toISOString().slice(0, 10)}`);
  const [serviceLevel, setServiceLevel] = useState("");
  const [fee, setFee] = useState("");
  const [shipping, setShipping] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ batchId: string; itemCount: number } | null>(null);
  const chosen = useMemo(() => candidates.filter((card) => selected.has(card.id)), [candidates, selected]);
  const totals = useMemo(() => chosen.reduce((sum, card) => ({
    raw: sum.raw + Number(card.rawMid || 0),
    expected: sum.expected + Number(card.expectedValue || 0),
    uplift: sum.uplift + Number(card.evUplift || 0),
  }), { raw: 0, expected: 0, uplift: 0 }), [chosen]);
  const enteredCosts = (Number(fee || 0) * chosen.length) + Number(shipping || 0);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setCreated(null);
  }

  async function createBatch() {
    setBusy(true);
    setError("");
    setCreated(null);
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          serviceLevel: serviceLevel || null,
          gradingFeePerCard: fee === "" ? null : Number(fee),
          shippingEstimate: shipping === "" ? null : Number(shipping),
          notes: notes || null,
          cardIds: chosen.map((card) => card.id),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : JSON.stringify(result.error));
      setCreated(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create submission batch");
    } finally {
      setBusy(false);
    }
  }

  if (!candidates.length) return <div className="card"><div className="empty">No recommended positive-gross-EV candidates yet.</div></div>;
  return <>
    <div className="metric-grid" style={{ marginBottom: 16 }}>
      <div className="metric"><div className="metric-label">Selected copies</div><div className="metric-value">{chosen.length}</div></div>
      <div className="metric"><div className="metric-label">Raw midpoint</div><div className="metric-value">{money(totals.raw)}</div></div>
      <div className="metric"><div className="metric-label">Expected slab</div><div className="metric-value">{money(totals.expected)}</div></div>
      <div className="metric"><div className="metric-label">Gross uplift</div><div className="metric-value good">{money(totals.uplift)}</div></div>
    </div>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head"><div><div className="card-title">Draft details</div><div className="row-sub">Fees are recorded for planning; the canonical CardVault EV remains gross.</div></div></div>
      <div className="card-body">
        <div className="upload-grid">
          <label><div className="grade-label">Batch name</div><input className="input" style={{ width: "100%" }} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} disabled={disabled || busy} /></label>
          <label><div className="grade-label">PSA service level</div><input className="input" style={{ width: "100%" }} value={serviceLevel} maxLength={80} placeholder="Optional" onChange={(event) => setServiceLevel(event.target.value)} disabled={disabled || busy} /></label>
          <label><div className="grade-label">Grading fee / card</div><input className="input" style={{ width: "100%" }} type="number" min="0" step="0.01" value={fee} onChange={(event) => setFee(event.target.value)} disabled={disabled || busy} /></label>
          <label><div className="grade-label">Shipping estimate</div><input className="input" style={{ width: "100%" }} type="number" min="0" step="0.01" value={shipping} onChange={(event) => setShipping(event.target.value)} disabled={disabled || busy} /></label>
        </div>
        <label><div className="grade-label">Notes</div><textarea className="input" style={{ width: "100%", minHeight: 72 }} value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} disabled={disabled || busy} /></label>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => setSelected(new Set(candidates.map((card) => card.id)))} disabled={disabled || busy}>Select all</button>
          <button className="btn" onClick={() => setSelected(new Set())} disabled={disabled || busy}>Clear</button>
          <button className="btn primary" onClick={() => void createBatch()} disabled={disabled || busy || !name.trim() || !chosen.length}>{busy ? "Creating…" : `Create draft (${chosen.length})`}</button>
          {enteredCosts > 0 && <span className="row-sub">Gross uplift less entered grading/shipping: {money(totals.uplift - enteredCosts)} (still not net profit)</span>}
        </div>
        {disabled && <div className="callout" style={{ marginTop: 12 }}>Connect Supabase to persist submission batches. The preserved local collection is read-only.</div>}
        {error && <div className="callout" style={{ marginTop: 12 }}>{error}</div>}
        {created && <div className="callout" style={{ marginTop: 12 }}>Created draft {created.batchId} with {created.itemCount} exact physical cards.</div>}
      </div>
    </div>
    <div className="card table-wrap"><table><thead><tr><th>Card</th><th>Likely</th><th>Raw</th><th>Expected slab</th><th>Gross uplift</th><th>Include</th></tr></thead><tbody>{candidates.map((card) => <tr key={card.id}><td><div className="row-title">{card.name} {card.cardNumber ? `#${card.cardNumber}` : ""}</div><div className="row-sub">{card.copyLabel} · {card.setName} · {card.variant || "Regular"}</div></td><td>{card.likelyGradeLabel}</td><td>{money(card.rawMid)}</td><td>{money(card.expectedValue)}</td><td style={{ color: "var(--good)" }}>{money(card.evUplift)}</td><td><input type="checkbox" aria-label={`Include ${card.name} ${card.copyLabel || "copy"}`} checked={selected.has(card.id)} onChange={() => toggle(card.id)} disabled={disabled || busy} /></td></tr>)}</tbody></table></div>
  </>;
}
