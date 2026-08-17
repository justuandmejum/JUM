import type { NextRequest } from "next/server";
import { getCallStatus } from "../../../../../../lib/calling";
import { BookingError } from "../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Public: the live call page (and the confirmed page, to decide whether to
// show a "Join Call" link) polls this — unlike POST .../call/join, this
// never creates a room, it just reports where things stand.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const status = await getCallStatus(id);
    return Response.json(status);
  } catch (err) {
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
