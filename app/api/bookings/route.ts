import type { NextRequest } from "next/server";
import { createBookingRequest, BookingError, SlotUnavailableError, DURATION_PRICING_INR } from "../../../lib/bookings";
import { CallMethod } from "../../../app/generated/prisma/enums";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CALL_METHODS = new Set(Object.values(CallMethod));

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { displayName, email, phone, date, startTime, duration, callMethod, sharedRealInfo, notes } = body;

  if (typeof displayName !== "string" || !displayName.trim()) {
    return Response.json({ error: "'displayName' is required." }, { status: 400 });
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return Response.json({ error: "A valid 'email' is required." }, { status: 400 });
  }
  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return Response.json({ error: "'date' is required, format YYYY-MM-DD." }, { status: 400 });
  }
  if (typeof startTime !== "number" || !Number.isInteger(startTime) || startTime < 0 || startTime > 1439) {
    return Response.json({ error: "'startTime' must be minutes since midnight (0-1439)." }, { status: 400 });
  }
  if (typeof duration !== "number" || !(duration in DURATION_PRICING_INR)) {
    return Response.json(
      { error: `'duration' must be one of: ${Object.keys(DURATION_PRICING_INR).join(", ")} minutes.` },
      { status: 400 }
    );
  }
  if (typeof callMethod !== "string" || !CALL_METHODS.has(callMethod as CallMethod)) {
    return Response.json({ error: `'callMethod' must be one of: ${[...CALL_METHODS].join(", ")}.` }, { status: 400 });
  }
  if (typeof sharedRealInfo !== "boolean") {
    return Response.json({ error: "'sharedRealInfo' must be a boolean." }, { status: 400 });
  }

  try {
    const booking = await createBookingRequest({
      displayName,
      email,
      phone: typeof phone === "string" ? phone : undefined,
      date,
      startTime,
      duration,
      callMethod: callMethod as CallMethod,
      sharedRealInfo,
      notes: typeof notes === "string" ? notes : undefined,
    });
    return Response.json({ booking }, { status: 201 });
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof BookingError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
