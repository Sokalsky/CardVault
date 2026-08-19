import { SubmissionBuilder } from "@/components/submission-builder";
import { isDemoMode, listCards } from "@/lib/repository";

export default async function SubmissionsPage() {
  const cards = await listCards();
  const candidates = cards.filter((card) =>
    ["graded", "grade_candidate"].includes(card.gradingStatus)
    && card.submissionDecision === "grade"
    && Number(card.evUplift || 0) > 0,
  ).sort((left, right) => Number(right.evUplift || 0) - Number(left.evUplift || 0));

  return <div className="page">
    <div className="page-head"><div><h1 className="page-title">PSA submission builder</h1><p className="page-sub">Build a draft from exact recommended physical copies without relying only on PSA 10 upside.</p></div></div>
    <div className="callout" style={{ marginBottom: 16 }}>Gross uplift is expected slab value minus raw midpoint. It does not subtract grading, shipping, insurance, selling fees, taxes, or other costs.</div>
    <SubmissionBuilder candidates={candidates} disabled={isDemoMode()} />
  </div>;
}
