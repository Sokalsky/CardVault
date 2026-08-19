export function money(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

export function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    graded: "Graded",
    ready: "Ready",
    ready_for_grading: "Ready",
    needs_photos: "Needs photos",
    needs_more_photos: "Needs more photos",
    ungraded: "Ungraded",
    do_not_grade: "Do not grade",
    processing: "Processing",
    grading: "Grading",
    recheck: "Recheck",
    grade_candidate: "Grade candidate",
    submitted_to_psa: "Submitted to PSA",
    psa_returned: "PSA returned",
  };
  return labels[status || ""] || status || "Unknown";
}

export function probabilityPercent(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "—";
  return `${Math.round(Number(value) * 100)}%`;
}
