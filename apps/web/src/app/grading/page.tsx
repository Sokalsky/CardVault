import Link from "next/link";
import { listCards } from "@/lib/repository";
import { StatusBadge } from "@/components/status-badge";
import { money } from "@/lib/format";
import { GradingBatchSelector } from "@/components/grading-batch-selector";

export default async function GradingPage() {
  const cards = await listCards();
  const queue = cards
    .filter((c) => ["graded", "grade_candidate", "needs_photos", "needs_more_photos", "ready_for_grading", "grading", "recheck", "do_not_grade", "ungraded"].includes(c.gradingStatus))
    .sort((a,b) => Number(b.rawMid || 0) - Number(a.rawMid || 0));
  const ready = queue.filter((c) => c.gradingStatus === "ready_for_grading");
  const graded = queue.filter((c) => c.gradingStatus === "graded");
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="page-title">Grading queue</h1><p className="page-sub">Upload media first, mark cards ready, then ask ChatGPT to grade the ready batch through MCP.</p></div><span className="badge good">{ready.length} ready</span></div>
      <div style={{marginBottom:16}}><GradingBatchSelector cards={ready} /></div>
      <div className="grid metrics">
        <div className="metric"><div className="metric-label">Ready</div><div className="metric-value">{ready.length}</div><div className="metric-detail">MCP can retrieve these immediately</div></div>
        <div className="metric"><div className="metric-label">Graded</div><div className="metric-value">{graded.length}</div><div className="metric-detail">Stored grading runs</div></div>
        <div className="metric"><div className="metric-label">Needs photos</div><div className="metric-value">{queue.filter(c=>["needs_photos","needs_more_photos"].includes(c.gradingStatus)).length}</div><div className="metric-detail">Media package incomplete</div></div>
        <div className="metric"><div className="metric-label">Queue value</div><div className="metric-value">{money(queue.reduce((s,c)=>s+Number(c.rawMid||0),0))}</div><div className="metric-detail">Raw midpoint</div></div>
      </div>
      <div className="card table-wrap">
        <table><thead><tr><th>Card</th><th>Copy</th><th>Raw</th><th>Status</th><th>Latest grade</th><th>Decision</th></tr></thead>
        <tbody>{queue.slice(0,180).map(card=><tr key={card.id}><td><Link href={`/cards/${card.id}`}><div className="row-title">{card.name} {card.cardNumber ? `#${card.cardNumber}` : ""}</div><div className="row-sub">{card.setName}</div></Link></td><td>{card.copyLabel}</td><td>{money(card.rawMid)}</td><td><StatusBadge status={card.gradingStatus}/></td><td>{card.likelyGradeLabel||"—"}</td><td>{["graded","grade_candidate"].includes(card.gradingStatus) ? "Review / submit decision" : "Open card"}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
