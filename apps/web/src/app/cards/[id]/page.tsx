import { notFound } from "next/navigation";
import { getCard, isDemoMode } from "@/lib/repository";
import { money, probabilityPercent } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { MediaUploader } from "@/components/media-uploader";
import { MediaGallery } from "@/components/media-gallery";
import { CardActions } from "@/components/card-actions";

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getCard(id);
  if (!card) notFound();
  const grade = card.latestGrade;
  const probs = grade?.probabilities || {};
  const media = card.media || [];
  const selectedCount = media.filter((m) => m.selectedForGrading).length;
  const valuation = card.latestValuation;
  const measurements = grade?.centeringMeasurements;
  const hasMeasurements = measurements && Object.values(measurements).some((value) => value != null);
  const gradingHistory = card.gradingHistory || [];

  return (
    <div className="page">
      <div className="detail-head">
        <div className="detail-title">
          <div className="detail-id">#{card.legacyMasterId || "—"}</div>
          <div>
            <h1 className="page-title">{card.name} {card.cardNumber ? `#${card.cardNumber}` : ""}</h1>
            <p className="page-sub">{card.setName || "Unknown set"} · {card.variant || "Regular printing"} · {card.copyLabel || "1 of 1"}</p>
          </div>
        </div>
        <div style={{display:"grid",gap:8,justifyItems:"end"}}><StatusBadge status={card.gradingStatus} /><CardActions cardId={card.id} status={card.gradingStatus} disabled={isDemoMode()} /></div>
      </div>

      <div className="detail-grid">
        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card">
            <div className="card-head"><div className="card-title">Grading media</div><span className="badge">{selectedCount} selected · {media.length} total</span></div>
            <div className="card-body">
              <MediaGallery media={media} disabled={isDemoMode()} />
              <div style={{ marginTop: 14 }}><MediaUploader cardId={card.id} disabled={isDemoMode()} /></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Card record</div></div>
            <div className="card-body">
              <div className="kv"><div className="kv-key">Raw range</div><div>{money(card.rawLow)} – {money(card.rawHigh)}</div></div>
              <div className="kv"><div className="kv-key">Raw midpoint</div><div>{money(card.rawMid)}</div></div>
              <div className="kv"><div className="kv-key">Condition</div><div>{card.condition || "Not reviewed"}</div></div>
              <div className="kv"><div className="kv-key">Toploader</div><div>{card.toploader ? "Yes" : "No"}</div></div>
              <div className="kv"><div className="kv-key">Permanent ID</div><div className="row-sub" style={{overflowWrap:"anywhere"}}>{card.id}</div></div>
              <div className="kv"><div className="kv-key">Notes</div><div>{card.notes || "—"}</div></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Grading history</div><span className="badge">{gradingHistory.length} run{gradingHistory.length === 1 ? "" : "s"}</span></div>
            <div className="card-body">
              {gradingHistory.length ? <div className="history-list">{gradingHistory.map((run, index) => <div className="history-row" key={run.id || index}>
                <div style={{display:"flex",justifyContent:"space-between",gap:10}}><strong>{run.likelyGradeLabel || "Grading run"}</strong><span className="badge">{run.decision || "review"}</span></div>
                <div className="row-sub" style={{marginTop:5}}>{run.createdAt ? new Date(run.createdAt).toLocaleString() : "Imported history"} · {run.rubricVersion || "rubric not recorded"}</div>
              </div>)}</div> : <div className="empty">No grading history yet.</div>}
            </div>
          </div>
        </div>

        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card">
            <div className="card-head"><div className="card-title">Latest pre-grade</div><span className="badge good">{card.likelyGradeLabel || "Not graded"}</span></div>
            <div className="card-body">
              {grade ? <>
                <div className="grade-grid">
                  <div className="grade-cell"><div className="grade-label">Centering</div><div className="grade-value">{grade.centering || "—"}</div>{grade.centeringNotes && <div className="grade-notes">{grade.centeringNotes}</div>}</div>
                  <div className="grade-cell"><div className="grade-label">Corners</div><div className="grade-value">{grade.corners || "—"}</div>{grade.cornersNotes && <div className="grade-notes">{grade.cornersNotes}</div>}</div>
                  <div className="grade-cell"><div className="grade-label">Edges</div><div className="grade-value">{grade.edges || "—"}</div>{grade.edgesNotes && <div className="grade-notes">{grade.edgesNotes}</div>}</div>
                  <div className="grade-cell"><div className="grade-label">Surface</div><div className="grade-value">{grade.surface || "—"}</div>{grade.surfaceNotes && <div className="grade-notes">{grade.surfaceNotes}</div>}</div>
                </div>
                {hasMeasurements && <div style={{marginTop:14}}>
                  <div className="grade-label" style={{marginBottom:6}}>Centering measurements</div>
                  <div className="kv"><div className="kv-key">Front L/R</div><div>{measurements.frontLeft ?? "—"} / {measurements.frontRight ?? "—"}</div></div>
                  <div className="kv"><div className="kv-key">Front T/B</div><div>{measurements.frontTop ?? "—"} / {measurements.frontBottom ?? "—"}</div></div>
                  <div className="kv"><div className="kv-key">Back L/R</div><div>{measurements.backLeft ?? "—"} / {measurements.backRight ?? "—"}</div></div>
                  <div className="kv"><div className="kv-key">Back T/B</div><div>{measurements.backTop ?? "—"} / {measurements.backBottom ?? "—"}</div></div>
                </div>}
                <div className="probs">
                  {([1,2,3,4,5,6,7,8,9,10] as const).map((g) => {
                    const value = probs[String(g) as keyof typeof probs]; if (value == null) return null;
                    return <div className="prob-row" key={g}><span>PSA {g}</span><div className="prob-track"><div className="prob-fill" style={{ width: `${Number(value)*100}%` }} /></div><span>{probabilityPercent(value)}</span></div>;
                  })}
                </div>
                {!!grade.defects?.length && <div style={{marginTop:16}}>
                  <div className="grade-label" style={{marginBottom:8}}>Defects found</div>
                  <div className="defect-list">{grade.defects.map((d, i) => <div className="defect-row" key={`${d.description}-${i}`}><span className="badge">{[d.side,d.region,d.category].filter(Boolean).join(" · ") || "Defect"}</span><span>{d.description}</span></div>)}</div>
                </div>}
                {grade.inspectionNotes && <div className="callout" style={{ marginTop: 14 }}>{grade.inspectionNotes}</div>}
              </> : <div className="empty">No grading run yet.</div>}
            </div>
          </div>

          <div className="card"><div className="card-head"><div className="card-title">Valuation</div></div><div className="card-body">
            <div className="kv"><div className="kv-key">Expected slab</div><div>{money(card.expectedValue)}</div></div>
            <div className="kv"><div className="kv-key">Gross EV uplift</div><div>{money(card.evUplift)}</div></div>
            {valuation && <div className="value-grid">
              {([1,2,3,4,5,6,7,8,9,10] as const).map((g) => {
                const value = valuation.values[String(g) as keyof typeof valuation.values];
                if (value == null) return null;
                const source = valuation.sources[String(g) as keyof typeof valuation.sources];
                return <div className="value-row" key={g}><div><strong>PSA {g}</strong>{source && <div className="row-sub">{source}</div>}</div><div>{money(value)}</div></div>;
              })}
            </div>}
            {valuation?.notes && <div className="upload-help">{valuation.notes}</div>}
            {valuation?.checkedAt && <div className="upload-help">Sources checked {new Date(valuation.checkedAt).toLocaleString()}.</div>}
            <div className="upload-help">Hierarchy: PSA exact-grade recent sales median (3+ comps) → PSA Estimate → PriceCharting fallback. Raw uses TCGplayer + PriceCharting.</div>
          </div></div>
        </div>
      </div>
    </div>
  );
}
