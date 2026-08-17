import type { NextRequest } from "next/server";
import { createBookingRequest, BookingError, SlotUnavailableError, DURATION_PRICING_INR } from "../../../lib/bookings";
import { CallMethod } from "../../../app/generated/prisma/enums";
import { checkRateLimit, getClientIp, tooManyRequestsResponse } from "../../../lib/rateLimit";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CALL_METHODS = new Set(Object.values(CallMethod));

const MAX_DISPLAY_NAME_LEN = 100;
const MAX_EMAIL_LEN = 254; // RFC 5321
const MAX_PHONE_LEN = 20;
const MAX_NOTES_LEN = 1000;

// A PENDING_APPROVAL booking occupies its slot in the DB for 15 minutes
// (see lib/bookings.ts APPROVAL_WINDOW_MINUTES) — without a limit here,
// scripted requests could hold every open slot on the calendar without
// ever intending to pay. 5 per 10 minutes per IP allows genuine retries
// (picking a different time after a slot turns out taken) without
// allowing calendar-griefing.
const RATE_LIMIT = { maxAttempts: 5, windowMs: 10 * 60 * 1000 };

export async function POST(request: NextRequest) {
  const allowed = await checkRateLimit(`booking:${getClientIp(request)}`, RATE_LIMIT);
  if (!allowed) return tooManyRequestsResponse(60);

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
  if (displayName.length > MAX_DISPLAY_NAME_LEN) {
    return Response.json({ error: `'displayName' must be ${MAX_DISPLAY_NAME_LEN} characters or fewer.` }, { status: 400 });
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return Response.json({ error: "A valid 'email' is required." }, { status: 400 });
  }
  if (email.length > MAX_EMAIL_LEN) {
    return Response.json({ error: `'email' must be ${MAX_EMAIL_LEN} characters or fewer.` }, { status: 400 });
  }
  if (typeof phone === "string" && phone.length > MAX_PHONE_LEN) {
    return Response.json({ error: `'phone' must be ${MAX_PHONE_LEN} characters or fewer.` }, { status: 400 });
  }
  if (typeof notes === "string" && notes.length > MAX_NOTES_LEN) {
    return Response.json({ error: `'notes' must be ${MAX_NOTES_LEN} characters or fewer.` }, { status: 400 });
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
