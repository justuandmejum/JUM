import type { NextRequest } from "next/server";
import { computeExtensionOptions } from "../../../../../../lib/calling";
import { BookingError, InvalidBookingStateError } from "../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Public: the live call page polls this to render the mid-call extension
// prompt, reusing the real availability engine to find what's actually
// free before the next booked slot (not a hardcoded close time).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await computeExtensionOptions(id);
    return Response.json(result);
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
