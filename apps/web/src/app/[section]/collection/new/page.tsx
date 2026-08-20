import { notFound } from "next/navigation";
import { NewCardForm } from "@/components/new-card-form";
import { isDemoMode } from "@/lib/repository";
import { DOMAIN_META, isDomain } from "@/lib/domain";

export default async function NewCardPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isDomain(section)) notFound();
  const meta = DOMAIN_META[section];
  return <div className="page"><div className="page-head"><div><h1 className="page-title">Add {meta.label} card</h1><p className="page-sub">Create the copy first, then upload its front/back photos and videos.</p></div></div><div style={{maxWidth:760}}><NewCardForm domain={section} disabled={isDemoMode()}/></div></div>;
}
