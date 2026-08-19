import { listCards } from "@/lib/repository";
import Link from "next/link";

export default async function MediaPage() {
  const cards = await listCards();
  const needs = cards.filter((c) => ["needs_photos", "needs_more_photos"].includes(c.gradingStatus));
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="page-title">Media workspace</h1><p className="page-sub">Original photos, short surface/edge videos, extracted frames and contact sheets stay tied to the physical copy.</p></div></div>
      <div className="section-grid">
        <div className="card"><div className="card-head"><div className="card-title">Recommended capture package</div></div><div className="card-body">
          <div className="kv"><div className="kv-key">Required</div><div>Front · Back · Centering screenshot</div></div>
          <div className="kv"><div className="kv-key">Surface</div><div>Front sweep · Back sweep</div></div>
          <div className="kv"><div className="kv-key">Edges</div><div>Top · Bottom · Left · Right short sweeps</div></div>
          <div className="kv"><div className="kv-key">Optional</div><div>Corner macro · defect macro</div></div>
          <div className="callout" style={{marginTop:14}}>Videos are processed by the separate FFmpeg worker. It samples frames, rejects blurry/near-duplicate frames, uploads the strongest stills, and leaves the original video attached to the card.</div>
        </div></div>
        <div className="card"><div className="card-head"><div className="card-title">Cards needing media</div><span className="badge warn">{needs.length}</span></div><div className="card-body"><div className="history-list">{needs.slice(0,20).map((card) => <Link className="history-row" href={`/cards/${card.id}`} key={card.id}><div className="row-title">{card.name} {card.cardNumber ? `#${card.cardNumber}` : ""}</div><div className="row-sub">{card.copyLabel || "Copy 1"} · {card.mediaCount || 0} stored media files</div></Link>)}</div>{!needs.length && <div className="empty">Every card has moved beyond the photo-needed stage.</div>}</div></div>
      </div>
    </div>
  );
}
