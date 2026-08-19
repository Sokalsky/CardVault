import { statusLabel } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
  const cls = ["graded", "grade_candidate", "psa_returned"].includes(status) ? "good" : status === "do_not_grade" ? "bad" : ["needs_photos", "needs_more_photos", "recheck"].includes(status) ? "warn" : ["ready_for_grading", "grading", "submitted_to_psa"].includes(status) ? "blue" : "";
  return <span className={`badge ${cls}`}>{statusLabel(status)}</span>;
}
