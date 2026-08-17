import { WaitingPageClient } from "./WaitingPageClient";

export default async function WaitingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WaitingPageClient bookingId={id} />;
}
