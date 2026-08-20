import { notFound } from "next/navigation";
import { SubmissionBuilder } from "@/components/submission-builder";
import { isDemoMode, listCards } from "@/lib/repository";
import { DOMAIN_META, isDomain } from "@/lib/domain";

export default async function SubmissionsPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isDomain(section)) notFound();
  const meta = DOMAIN_META[section];
  const cards = await listCards({ domain: section });
  const candidates = cards.filter((card) =>
    ["graded", "grade_candidate"].includes(card.gradingStatus)
    && card.submissionDecision === "grade"
    && Number(card.evUplift || 0) > 0,
  ).sort((left, right) => Number(right.evUplift || 0) - Number(left.evUplift || 0));

  return <div className="page">
    <div className="page-head"><div><h1 className="page-title">{meta.label} PSA submissions</h1><p className="page-sub">Build a draft from exact recommended physical copies without relying only on PSA 10 upside.</p></div></div>
    <div className="callout" style={{ marginBottom: 16 }}>Gross uplift is expected slab value minus raw midpoint. It does not subtract grading, shipping, insurance, selling fees, taxes, or other costs.</div>
    <SubmissionBuilder candidates={candidates} disabled={isDemoMode()} />
  </div>;
}
