import { notFound } from "next/navigation";
import { LegalPageClient } from "./LegalPageClient";

const VALID_SLUGS = ["terms", "privacy", "disclaimer", "refund"] as const;
export type LegalSlug = (typeof VALID_SLUGS)[number];

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!VALID_SLUGS.includes(slug as LegalSlug)) notFound();
  return <LegalPageClient slug={slug as LegalSlug} />;
}
