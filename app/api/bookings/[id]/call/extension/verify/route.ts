import type { NextRequest } from "next/server";
import { verifyAndApplyExtensionPayment } from "../../../../../../../lib/payments";
import { BookingError, InvalidBookingStateError } from "../../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Public: fast-path confirmation after Razorpay Checkout's success handler
// fires for an extension payment — the webhook is still the authoritative
// path (see lib/payments.ts's handleRazorpayWebhook).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, minutes } = body;
  if (
    typeof razorpay_order_id !== "string" ||
    typeof razorpay_payment_id !== "string" ||
    typeof razorpay_signature !== "string" ||
    typeof minutes !== "number" ||
    !Number.isInteger(minutes)
  ) {
    return Response.json(
      { error: "'razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature', and 'minutes' are all required." },
      { status: 400 }
    );
  }

  try {
    await verifyAndApplyExtensionPayment(id, minutes, {
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
