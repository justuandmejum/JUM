import { ConfirmedPageClient } from "./ConfirmedPageClient";

export default async function ConfirmedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConfirmedPageClient bookingId={id} />;
}
