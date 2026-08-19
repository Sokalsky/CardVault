import Link from "next/link";
import { listCards } from "@/lib/repository";
import { money } from "@/lib/format";
import { CardsTable } from "@/components/cards-table";

export default async function DashboardPage() {
  const cards = await listCards();
  const graded = cards.filter((c) => c.gradingStatus === "graded");
  const needPhotos = cards.filter((c) => c.gradingStatus === "needs_photos");
  const ready = cards.filter((c) => c.gradingStatus === "ready_for_grading");
  const gradeCandidates = cards.filter((c) => c.gradingStatus === "grade_candidate");
  const submissionCandidates = cards.filter((c) => ["grade_candidate", "graded"].includes(c.gradingStatus) && c.submissionDecision === "grade" && Number(c.evUplift || 0) > 0);
  const rawTotal = cards.reduce((sum, c) => sum + Number(c.rawMid || 0), 0);
  const gradingEv = graded.reduce((sum, c) => sum + Number(c.evUplift || 0), 0);
  const top = [...cards].sort((a, b) => Number(b.rawMid || 0) - Number(a.rawMid || 0)).slice(0, 12);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Collection dashboard</h1><p className="page-sub">Inventory, grading queue, media and PSA submission decisions in one place.</p></div>
        <Link href="/grading" className="btn primary">Open grading queue</Link>
      </div>
      <div className="grid metrics">
        <div className="metric"><div className="metric-label">Physical cards</div><div className="metric-value">{cards.length.toLocaleString()}</div><div className="metric-detail">Every duplicate tracked separately</div></div>
        <div className="metric"><div className="metric-label">Raw midpoint</div><div className="metric-value">{money(rawTotal)}</div><div className="metric-detail">TCGplayer + PriceCharting workflow</div></div>
        <div className="metric"><div className="metric-label">Manually graded</div><div className="metric-value">{graded.length}</div><div className="metric-detail">Each with 4 criteria + probabilities</div></div>
        <div className="metric"><div className="metric-label">Gross grading EV</div><div className="metric-value">{money(gradingEv)}</div><div className="metric-detail">Before PSA/shipping/selling costs</div></div>
        <div className="metric"><div className="metric-label">Ready for grading</div><div className="metric-value">{ready.length}</div><div className="metric-detail">Selected media available through MCP</div></div>
        <div className="metric"><div className="metric-label">Grade candidates</div><div className="metric-value">{gradeCandidates.length}</div><div className="metric-detail">{submissionCandidates.length} positive-gross-EV PSA candidates</div></div>
      </div>

      <div className="section-grid">
        <div>
          <div className="card-head" style={{ border: 0, paddingLeft: 0 }}><div className="card-title">Highest raw-value cards</div><Link href="/collection" className="btn">View collection</Link></div>
          <CardsTable cards={top} initialLimit={12} />
        </div>
        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card"><div className="card-head"><div className="card-title">Grading workflow</div></div><div className="card-body">
            <div className="kv"><div className="kv-key">Needs photos</div><div>{needPhotos.length}</div></div>
            <div className="kv"><div className="kv-key">Graded</div><div>{graded.length}</div></div>
            <div className="kv"><div className="kv-key">Ready</div><div>{ready.length}</div></div>
            <div className="kv"><div className="kv-key">MCP flow</div><div>Ready → ChatGPT review → saved result</div></div>
          </div></div>
          <div className="callout">The app stores the images and data. ChatGPT does the actual grading through your subscription via the MCP service — no OpenAI API key is built into this project.</div>
        </div>
      </div>
    </div>
  );
}
