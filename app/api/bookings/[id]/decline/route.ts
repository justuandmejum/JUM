import type { NextRequest } from "next/server";
import { checkAdminAuthAndCsrf } from "../../../../../lib/admin-auth";
import { declineBooking, BookingError, InvalidBookingStateError } from "../../../../../lib/bookings";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuthAndCsrf(request);
  if (authError) return authError;

  const { id } = await params;
  try {
    const booking = await declineBooking(id);
    return Response.json({ booking });
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
