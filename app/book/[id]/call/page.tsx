import { CallPageClient } from "./CallPageClient";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CallPageClient bookingId={id} />;
}
