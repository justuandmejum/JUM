import type { NextRequest } from "next/server";
import { generateJoinToken } from "../../../../../../lib/calling";
import { BookingError, InvalidBookingStateError } from "../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Public: the customer's browser calls this from the confirmed page /
// live call page to get a Daily.co room URL + join token. Same
// capability-URL pattern as every other customer-facing booking action.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const joinInfo = await generateJoinToken(id, false);
    return Response.json(joinInfo);
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
