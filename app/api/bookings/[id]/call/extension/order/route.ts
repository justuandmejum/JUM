import type { NextRequest } from "next/server";
import { initiateExtensionOrder } from "../../../../../../../lib/calling";
import { BookingError, InvalidBookingStateError } from "../../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Public: creates a Razorpay order for a chosen extension tier.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { minutes } = body;
  if (typeof minutes !== "number" || !Number.isInteger(minutes)) {
    return Response.json({ error: "'minutes' is required and must be a whole number." }, { status: 400 });
  }

  try {
    const order = await initiateExtensionOrder(id, minutes);
    return Response.json(order);
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
