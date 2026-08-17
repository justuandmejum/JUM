import type { NextRequest } from "next/server";
import { initiatePayment } from "../../../../../../lib/payments";
import { BookingError, InvalidBookingStateError } from "../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Public: the customer's browser calls this once JUM has approved their
// request, to get a Razorpay order to open Checkout against.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const order = await initiatePayment(id);
    return Response.json(order);
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
