"use client";

import { useMemo, useState } from "react";
import type { CardListItem } from "@/lib/types";

export function GradingBatchSelector({ cards }: { cards: CardListItem[] }) {
  const [selected, setSelected] = useState(() => new Set(cards.slice(0, 5).map((card) => card.id)));
  const [copied, setCopied] = useState(false);
  const chosen = useMemo(() => cards.filter((card) => selected.has(card.id)), [cards, selected]);
  const prompt = `Use the CardVault MCP tools to grade these exact physical card IDs in order: ${chosen.map((card) => `${card.id} (${card.name}, ${card.copyLabel || "copy"})`).join("; ")}. For each card, call get_card_for_grading, inspect selected media defect-first, save_grade as a new run, research exact-variant PSA values, then save_valuation.`;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setCopied(false);
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
  }

  if (!cards.length) return <div className="empty">No cards are marked Ready for Grading.</div>;
  return <div className="card">
    <div className="card-head"><div><div className="card-title">Prepare a ChatGPT grading batch</div><div className="row-sub">Selection only organizes permanent CardVault records; it does not call an AI API.</div></div><span className="badge blue">{chosen.length} selected</span></div>
    <div className="card-body">
      <div className="toolbar">
        <button className="btn" onClick={() => setSelected(new Set(cards.map((card) => card.id)))}>Select all ready</button>
        <button className="btn" onClick={() => setSelected(new Set())}>Clear</button>
        <button className="btn primary" disabled={!chosen.length} onClick={() => void copyPrompt()}>{copied ? "Prompt copied" : "Copy ChatGPT batch prompt"}</button>
      </div>
      <div className="batch-list">
        {cards.map((card) => <label className="batch-row" key={card.id}>
          <input type="checkbox" checked={selected.has(card.id)} onChange={() => toggle(card.id)} />
          <span><span className="row-title">{card.name} {card.cardNumber ? `#${card.cardNumber}` : ""}</span><span className="row-sub">{card.setName} · {card.variant || "Regular"} · {card.copyLabel || "Copy 1"}</span></span>
          <span className="badge">{card.mediaCount || 0} media</span>
        </label>)}
      </div>
    </div>
  </div>;
}
