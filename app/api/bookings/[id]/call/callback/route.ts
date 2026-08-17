import type { NextRequest } from "next/server";
import { checkAdminAuthAndCsrf } from "../../../../../../lib/admin-auth";
import { sendCallback } from "../../../../../../lib/calling";
import { BookingError, InvalidBookingStateError } from "../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// JUM's dropped-call recovery, from the Host Panel — issues a fresh
// customer join link (once per session, see Session.callbackUsed) for
// JUM to relay manually (no automated notifications yet — Phase 5).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuthAndCsrf(request);
  if (authError) return authError;

  const { id } = await params;
  try {
    const joinInfo = await sendCallback(id);
    return Response.json(joinInfo);
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
