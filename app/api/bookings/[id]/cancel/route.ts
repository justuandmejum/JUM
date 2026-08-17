import type { NextRequest } from "next/server";
import { cancelByCustomer } from "../../../../../lib/cancellation";
import { BookingError, InvalidBookingStateError } from "../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Public, same capability-URL pattern as the other customer-facing
// booking endpoints (possession of the booking id is the authorization —
// there's no customer account system). Refund tier follows the policy
// published at /legal/refund.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await cancelByCustomer(id);
    return Response.json(result);
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
