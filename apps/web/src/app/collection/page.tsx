import { listCards } from "@/lib/repository";
import { CardsTable } from "@/components/cards-table";
import Link from "next/link";

export default async function CollectionPage() {
  const cards = await listCards();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Collection</h1>
          <p className="page-sub">One row per physical card. Copies never inherit each other’s condition or grade.</p>
        </div>
        <Link href="/collection/new" className="btn primary">Add card</Link>
      </div>
      <CardsTable cards={cards} />
    </div>
  );
}
