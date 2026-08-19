import { listCards } from "@/lib/repository";
import { CardsList } from "@/components/cards-list";
import Link from "next/link";

export default async function CollectionPage() {
  const cards = await listCards({ includeThumbnails: true });
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Collection</h1>
          <p className="page-sub">One entry per physical copy. Your front photo takes priority over reference artwork.</p>
        </div>
        <Link href="/collection/new" className="btn primary">Add card</Link>
      </div>
      <CardsList cards={cards} />
    </div>
  );
}
