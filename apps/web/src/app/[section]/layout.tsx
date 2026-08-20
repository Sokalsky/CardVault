import { notFound } from "next/navigation";
import { isDomain } from "@/lib/domain";

export default async function SectionLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ section: string }> }>) {
  const { section } = await params;
  if (!isDomain(section)) notFound();
  return <>{children}</>;
}
