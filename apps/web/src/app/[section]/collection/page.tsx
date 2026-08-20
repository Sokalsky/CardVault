import { listCards } from "@/lib/repository";
import { CardsList } from "@/components/cards-list";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOMAIN_META, isDomain } from "@/lib/domain";

export default async function CollectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isDomain(section)) notFound();
  const meta = DOMAIN_META[section];
  const cards = await listCards({ includeThumbnails: true, domain: section });
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{meta.label} collection</h1>
          <p className="page-sub">One entry per physical copy. Your front photo takes priority over reference artwork.</p>
        </div>
        <Link href={`/${section}/collection/new`} className="btn primary">Add card</Link>
      </div>
      {cards.length === 0 ? (
        <div className="section-hero">
          <div className="section-hero-art" aria-hidden />
          <h2 className="page-title hero-title">No {meta.label} cards yet</h2>
          <p className="page-sub hero-sub">
            {section === "sports"
              ? "Add your first sports card — player, set, number and parallel — then attach photos for grading."
              : "Add your first card, then attach photos for grading."}
          </p>
          <div className="hero-actions">
            <Link href={`/${section}/collection/new`} className="btn primary">Add your first card</Link>
          </div>
        </div>
      ) : (
        <CardsList cards={cards} />
      )}
    </div>
  );
}
