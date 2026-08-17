import type { NextRequest } from "next/server";
import { endSession } from "../../../../../../lib/calling";
import { BookingError, InvalidBookingStateError } from "../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Public — either party leaving the call UI triggers this (alongside
// daily-js's own .leave()), so the booking reaches COMPLETED promptly
// rather than waiting for the room to expire on its own.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await endSession(id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
