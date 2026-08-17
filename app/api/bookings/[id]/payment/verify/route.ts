import type { NextRequest } from "next/server";
import { verifyAndConfirmPayment } from "../../../../../../lib/payments";
import { BookingError, InvalidBookingStateError } from "../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Public: called by the client after Razorpay Checkout's success handler
// fires. This is a fast-path confirmation for a responsive UI — the
// webhook (POST /api/webhooks/razorpay) is the authoritative path and
// will confirm the booking even if the customer closes the tab before
// this ever runs.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (typeof razorpay_order_id !== "string" || typeof razorpay_payment_id !== "string" || typeof razorpay_signature !== "string") {
    return Response.json(
      { error: "'razorpay_order_id', 'razorpay_payment_id', and 'razorpay_signature' are all required." },
      { status: 400 }
    );
  }

  try {
    const booking = await verifyAndConfirmPayment(id, {
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });
    return Response.json({ booking });
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
