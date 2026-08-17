import type { NextRequest } from "next/server";
import { checkAdminAuthAndCsrf } from "../../../../../../lib/admin-auth";
import { generateJoinToken } from "../../../../../../lib/calling";
import { BookingError, InvalidBookingStateError } from "../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// JUM's own join, from the admin dashboard — an owner token, distinct
// from the customer's (see lib/calling.ts's generateJoinToken isHost flag).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuthAndCsrf(request);
  if (authError) return authError;

  const { id } = await params;
  try {
    const joinInfo = await generateJoinToken(id, true);
    return Response.json(joinInfo);
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
