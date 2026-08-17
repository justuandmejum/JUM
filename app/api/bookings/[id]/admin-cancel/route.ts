import type { NextRequest } from "next/server";
import { checkAdminAuthAndCsrf } from "../../../../../lib/admin-auth";
import { cancelByAdmin } from "../../../../../lib/cancellation";
import { BookingError, InvalidBookingStateError } from "../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// JUM cancelling a confirmed session (emergency, unavailability, etc.) —
// always a full refund per the policy at /legal/refund.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuthAndCsrf(request);
  if (authError) return authError;

  const { id } = await params;
  try {
    const result = await cancelByAdmin(id);
    return Response.json(result);
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
