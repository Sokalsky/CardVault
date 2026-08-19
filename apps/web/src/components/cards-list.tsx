"use client";

import { useMemo, useState } from "react";
import { ImageIcon } from "lucide-react";
import Link from "next/link";
import type { CardListItem } from "@/lib/types";
import { money } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export function CardsList({ cards, initialLimit = 100 }: { cards: CardListItem[]; initialLimit?: number }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(initialLimit);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((card) => {
      const matchesStatus = status === "all" || card.gradingStatus === status;
      const haystack = [card.name, card.cardNumber, card.setName, card.variant, card.copyLabel]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
  }, [cards, query, status]);

  const visible = filtered.slice(0, limit);

  return (
    <>
      <div className="toolbar collection-toolbar">
        <input
          className="input search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Pokémon, set, number, variant…"
        />
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="graded">Graded</option>
          <option value="ungraded">Ungraded</option>
          <option value="needs_photos">Needs photos</option>
          <option value="needs_more_photos">Needs more photos</option>
          <option value="ready_for_grading">Ready for grading</option>
          <option value="recheck">Recheck</option>
          <option value="grade_candidate">Grade candidate</option>
          <option value="do_not_grade">Do not grade</option>
        </select>
        <div className="collection-count">{filtered.length.toLocaleString()} physical {filtered.length === 1 ? "card" : "cards"}</div>
      </div>

      <div className="collection-list">
        {visible.map((card) => (
          <Link className="collection-list-item" href={`/cards/${card.id}`} key={card.id}>
            <div className="collection-thumb">
              <div className="collection-thumb-fallback"><ImageIcon size={22} /><span>No front</span></div>
              {card.thumbnailUrl && (
                // Signed private-media URLs and exact-printing reference URLs are generated server-side.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.thumbnailUrl} alt={`${card.name} front`} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />
              )}
              {card.thumbnailSource && <span className="collection-image-source">{card.thumbnailSource === "grading" ? "Your front" : "Reference"}</span>}
            </div>

            <div className="collection-main">
              <div className="collection-identity">
                <div className="row-title">{card.name}{card.cardNumber ? ` #${card.cardNumber}` : ""}</div>
                <div className="row-sub">{card.setName || "Unknown set"}{card.variant ? ` · ${card.variant}` : ""}</div>
                <div className="collection-copy">Copy {card.copyLabel || "1 of 1"}</div>
              </div>
              <div className="collection-status"><StatusBadge status={card.gradingStatus} /></div>
              <div className="collection-stats">
                <div><span>Raw</span><strong>{money(card.rawMid)}</strong></div>
                <div><span>Media</span><strong>{card.mediaCount ? `${card.mediaCount} file${card.mediaCount === 1 ? "" : "s"}` : "—"}</strong></div>
                <div><span>Likely grade</span><strong>{card.likelyGradeLabel || "—"}</strong></div>
                <div><span>Expected slab</span><strong>{money(card.expectedValue)}</strong></div>
                <div><span>EV uplift</span><strong className={card.evUplift == null ? "" : card.evUplift >= 0 ? "positive" : "negative"}>{money(card.evUplift)}</strong></div>
              </div>
            </div>
          </Link>
        ))}
        {visible.length === 0 && <div className="empty card">No cards match those filters.</div>}
      </div>

      {visible.length < filtered.length && (
        <div className="collection-more">
          <button className="btn" onClick={() => setLimit((current) => current + 100)}>
            Show more ({(filtered.length - visible.length).toLocaleString()} remaining)
          </button>
        </div>
      )}
    </>
  );
}
