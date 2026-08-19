"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CardListItem } from "@/lib/types";
import { money } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export function CardsTable({ cards, initialLimit = 100 }: { cards: CardListItem[]; initialLimit?: number }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(initialLimit);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((card) => {
      const matchesStatus = status === "all" || card.gradingStatus === status;
      const haystack = [card.name, card.cardNumber, card.setName, card.variant, card.copyLabel].filter(Boolean).join(" ").toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
  }, [cards, query, status]);

  const visible = filtered.slice(0, limit);

  return (
    <>
      <div className="toolbar">
        <input className="input search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Pokémon, set, number, variant…" />
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
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
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Card</th><th>Copy</th><th>Raw</th><th>Media</th><th>Status</th><th>Likely grade</th><th>Expected slab</th><th>EV uplift</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((card) => (
              <tr key={card.id}>
                <td>
                  <Link href={`/cards/${card.id}`}>
                    <div className="row-title">{card.name} {card.cardNumber ? `#${card.cardNumber}` : ""}</div>
                    <div className="row-sub">{card.setName || "Unknown set"}{card.variant ? ` · ${card.variant}` : ""}</div>
                  </Link>
                </td>
                <td>{card.copyLabel || "1 of 1"}</td>
                <td>{money(card.rawMid)}</td>
                <td>{card.mediaCount ? `${card.mediaCount} file${card.mediaCount === 1 ? "" : "s"}` : "—"}</td>
                <td><StatusBadge status={card.gradingStatus} /></td>
                <td>{card.likelyGradeLabel || "—"}</td>
                <td>{money(card.expectedValue)}</td>
                <td>{card.evUplift == null ? "—" : <span style={{ color: card.evUplift >= 0 ? "var(--good)" : "var(--bad)" }}>{money(card.evUplift)}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <div className="empty">No cards match those filters.</div>}
      </div>
      {visible.length < filtered.length && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <button className="btn" onClick={() => setLimit((x) => x + 100)}>Show more ({filtered.length - visible.length} remaining)</button>
        </div>
      )}
    </>
  );
}
