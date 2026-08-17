import { AdminCallPageClient } from "./AdminCallPageClient";

export default async function AdminCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminCallPageClient bookingId={id} />;
}
