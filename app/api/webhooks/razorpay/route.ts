import type { NextRequest } from "next/server";
import { handleRazorpayWebhook } from "../../../../lib/payments";
import { BookingError } from "../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Razorpay calls this directly — must be registered in the Razorpay
// dashboard (Settings -> Webhooks) once this app has a public HTTPS URL,
// pointing here with RAZORPAY_WEBHOOK_SECRET as the webhook's secret.
// The signature covers the raw request body, so it must be read via
// request.text() before any JSON parsing happens.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  try {
    const result = await handleRazorpayWebhook(rawBody, signature);
    return Response.json(result);
  } catch (err) {
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
