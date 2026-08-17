import { PayPageClient } from "./PayPageClient";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayPageClient bookingId={id} />;
}
