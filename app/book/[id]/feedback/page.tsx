import { FeedbackPageClient } from "./FeedbackPageClient";

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FeedbackPageClient bookingId={id} />;
}
