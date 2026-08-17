// Real calling via Daily.co (JUM's own calling method only — Google
// Meet/Zoom/Teams are external, the customer joins those on their own,
// no room for us to manage). Mirrors the prototype's call.html screen:
// live timer, mid-call paid extension (checked against the real
// availability engine, not a hardcoded close time), a one-time
// dropped-call recovery link, and ending a call marks the booking
// COMPLETED — the schema's Session/Feedback models already anticipated
// all of this since Phase 1.

import { prisma } from "./prisma";
import { createRoom, createMeetingToken, updateRoomExp } from "./daily";
import { createOrder } from "./razorpay";
import { getOpenWindows, getBookedRanges } from "./availability";
import { istWallClockToUtc } from "./istTime";
import { EXTENSION_PRICING_INR } from "./pricing";
import { BookingError, InvalidBookingStateError } from "./bookings";
import { BookingStatus, CallMethod, SessionStatus, PaymentRecordStatus, PaymentType } from "../app/generated/prisma/enums";
import type { Booking, Session } from "../app/generated/prisma/client";

const JOIN_WINDOW_BEFORE_MINUTES = 10; // can join up to 10 min before scheduled start
const ROOM_EXP_BUFFER_SECONDS = 30 * 60; // extra headroom on top of the scheduled end, for extensions

// Daily room URLs are deterministic (https://<domain>.daily.co/<room-name>)
// — confirmed once against this real account via the API's own create-room
// response (see PROJECT_STATUS.md) rather than assumed.
const DAILY_DOMAIN = "justuandme";
function roomUrl(roomName: string): string {
  return `https://${DAILY_DOMAIN}.daily.co/${roomName}`;
}

function effectiveEndMinutes(booking: Booking, session: Session | null): number {
  return booking.startTime + booking.duration + (session?.extensionMinutes ?? 0);
}

async function requireCallableBooking(bookingId: string): Promise<Booking> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new BookingError(`Booking ${bookingId} not found.`);
  if (booking.bookingStatus !== BookingStatus.CONFIRMED) {
    throw new InvalidBookingStateError(`Booking ${bookingId} is ${booking.bookingStatus}, not CONFIRMED.`);
  }
  if (booking.callMethod !== CallMethod.JUM) {
    throw new BookingError("This session uses an external calling option — join using the link JUM shares with you directly, not through this app.");
  }
  return booking;
}

/** Ensures a Session + Daily.co room exist for a bookable session. Idempotent. */
async function getOrCreateSession(booking: Booking): Promise<Session> {
  const existing = await prisma.session.findUnique({ where: { bookingId: booking.id } });
  if (existing?.roomId) return existing;

  const expUnix = Math.floor(istWallClockToUtc(booking.date, effectiveEndMinutes(booking, existing)).getTime() / 1000) + ROOM_EXP_BUFFER_SECONDS;
  const roomName = `jum-${booking.callCode.replace("JUM-", "").toLowerCase()}`;
  const room = await createRoom(roomName, expUnix);

  if (existing) {
    return prisma.session.update({ where: { id: existing.id }, data: { roomId: room.name } });
  }
  return prisma.session.create({ data: { bookingId: booking.id, roomId: room.name } });
}

export interface CallStatusInfo {
  bookingStatus: BookingStatus;
  callMethod: CallMethod;
  sessionStatus: SessionStatus | null;
  extensionMinutes: number;
  joinOpensAtMs: number;
  endsAtMs: number;
}

/** A read-only status probe for the live call page — unlike
 * requireCallableBooking, this doesn't throw for a not-yet-confirmed
 * booking or a non-JUM call method, since the UI needs to render a
 * sensible message for those states rather than an error. */
export async function getCallStatus(bookingId: string): Promise<CallStatusInfo> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new BookingError(`Booking ${bookingId} not found.`);
  const session = await prisma.session.findUnique({ where: { bookingId } });

  const startUtc = istWallClockToUtc(booking.date, booking.startTime);
  const endUtc = istWallClockToUtc(booking.date, effectiveEndMinutes(booking, session));

  return {
    bookingStatus: booking.bookingStatus,
    callMethod: booking.callMethod,
    sessionStatus: session?.status ?? null,
    extensionMinutes: session?.extensionMinutes ?? 0,
    joinOpensAtMs: startUtc.getTime() - JOIN_WINDOW_BEFORE_MINUTES * 60_000,
    endsAtMs: endUtc.getTime(),
  };
}

export interface JoinInfo {
  url: string;
  token: string;
}

/** Generates a join token for the customer (never an owner) or JUM (always
 * an owner). Enforces the real join window — not joinable long before or
 * after the session, matching real-world sensibility the prototype didn't
 * need to model since everything there was simulated. */
export async function generateJoinToken(bookingId: string, isHost: boolean): Promise<JoinInfo> {
  const booking = await requireCallableBooking(bookingId);

  // Check the join window against a plain read before ever creating (or
  // even looking to create) a Daily room — otherwise a too-late join
  // attempt would reach Daily's API with an already-past `exp` and fail
  // with a raw Daily error instead of our own clean message (caught by
  // scripts/test-calling.ts's real-API run, not something a mock would
  // have surfaced).
  const existingSession = await prisma.session.findUnique({ where: { bookingId: booking.id } });
  const startUtc = istWallClockToUtc(booking.date, booking.startTime);
  const joinOpensAt = startUtc.getTime() - JOIN_WINDOW_BEFORE_MINUTES * 60_000;
  const endUtc = istWallClockToUtc(booking.date, effectiveEndMinutes(booking, existingSession));
  const now = Date.now();

  if (now < joinOpensAt) {
    throw new InvalidBookingStateError(`This session isn't joinable yet — it opens ${JOIN_WINDOW_BEFORE_MINUTES} minutes before the scheduled start.`);
  }
  if (now > endUtc.getTime()) {
    throw new InvalidBookingStateError("This session's time has already ended.");
  }

  const session = await getOrCreateSession(booking);
  const tokenExpUnix = Math.floor(endUtc.getTime() / 1000) + ROOM_EXP_BUFFER_SECONDS;
  const userName = isHost ? "JUM" : booking.sharedRealInfo ? "Customer" : "Guest";
  const token = await createMeetingToken(session.roomId!, userName, isHost, tokenExpUnix);

  // A fresh join (from SCHEDULED, or the customer rejoining after a
  // host-issued callback link) marks the call as under way again.
  let nextStatus = session.status;
  if (session.status === SessionStatus.SCHEDULED) nextStatus = SessionStatus.ACTIVE;
  else if (session.status === SessionStatus.INTERRUPTED && !isHost) nextStatus = SessionStatus.ACTIVE;

  if (nextStatus !== session.status || !session.startedAt) {
    await prisma.session.update({
      where: { id: session.id },
      data: { status: nextStatus, startedAt: session.startedAt ?? new Date() },
    });
  }

  return { url: roomUrl(session.roomId!), token };
}

/** Ends a call: marks the Session COMPLETED and the Booking COMPLETED
 * (the schema's terminal booking state — nothing reached it before this). */
export async function endSession(bookingId: string): Promise<void> {
  const booking = await requireCallableBooking(bookingId);
  const session = await prisma.session.findUnique({ where: { bookingId: booking.id } });
  if (!session) throw new BookingError("This session hasn't started.");

  await prisma.$transaction([
    prisma.session.update({ where: { id: session.id }, data: { status: SessionStatus.COMPLETED, endedAt: new Date() } }),
    prisma.booking.update({ where: { id: booking.id }, data: { bookingStatus: BookingStatus.COMPLETED } }),
  ]);
}

/** JUM marks a call as dropped and issues the customer a fresh join link
 * — limited to once per session (Session.callbackUsed), to prevent misuse. */
export async function sendCallback(bookingId: string): Promise<JoinInfo> {
  const booking = await requireCallableBooking(bookingId);
  const session = await prisma.session.findUnique({ where: { bookingId: booking.id } });
  if (!session) throw new BookingError("This session hasn't started.");
  if (session.callbackUsed) throw new InvalidBookingStateError("A callback link has already been used for this session.");

  await prisma.session.update({ where: { id: session.id }, data: { status: SessionStatus.INTERRUPTED, callbackUsed: true } });
  return generateJoinToken(booking.id, false);
}

export interface ExtensionOption {
  minutes: number;
  priceInr: number;
}

/** Extension tiers that actually fit before the next booked slot (or the
 * day's close), reusing the real availability engine rather than a
 * hardcoded close time like the prototype. */
export async function computeExtensionOptions(bookingId: string): Promise<{ freeMinutes: number; options: ExtensionOption[] }> {
  const booking = await requireCallableBooking(bookingId);
  const session = await prisma.session.findUnique({ where: { bookingId: booking.id } });
  const currentEnd = effectiveEndMinutes(booking, session);

  const dateStr = `${booking.date.getUTCFullYear()}-${String(booking.date.getUTCMonth() + 1).padStart(2, "0")}-${String(booking.date.getUTCDate()).padStart(2, "0")}`;
  const [openWindows, booked] = await Promise.all([getOpenWindows(dateStr), getBookedRanges(dateStr)]);

  const containingWindow = openWindows.find((w) => w.start <= currentEnd && currentEnd <= w.end);
  let boundary = containingWindow?.end ?? currentEnd;

  for (const b of booked) {
    if (b.start === booking.startTime && b.end === booking.endTime) continue; // this booking's own range
    if (b.start >= currentEnd && b.start < boundary) boundary = b.start;
  }

  const freeMinutes = Math.max(0, boundary - currentEnd);
  const options = Object.entries(EXTENSION_PRICING_INR)
    .map(([mins, price]) => ({ minutes: Number(mins), priceInr: price }))
    .filter((o) => o.minutes <= freeMinutes)
    .sort((a, b) => a.minutes - b.minutes);

  return { freeMinutes, options };
}

export interface ExtensionOrderInfo {
  orderId: string;
  amountInPaise: number;
  currency: string;
  keyId: string;
}

/** Creates a Razorpay order for a chosen extension tier. Applying the
 * extension (extending the room + Session.extensionMinutes) happens once
 * payment is verified — see applyExtension() below, called from
 * lib/payments.ts's webhook/verify paths. */
export async function initiateExtensionOrder(bookingId: string, minutes: number): Promise<ExtensionOrderInfo> {
  const { options } = await computeExtensionOptions(bookingId);
  const chosen = options.find((o) => o.minutes === minutes);
  if (!chosen) throw new BookingError(`${minutes} minutes isn't a valid, currently-available extension option.`);

  const order = await createOrder(chosen.priceInr, `ext-${bookingId}-${Date.now().toString(36)}`.slice(0, 40), {
    bookingId,
    extensionMinutes: String(minutes),
  });

  await prisma.payment.create({
    data: {
      bookingId,
      type: PaymentType.EXTENSION,
      amountInr: chosen.priceInr,
      status: PaymentRecordStatus.PENDING,
      gatewayOrderId: order.id,
    },
  });

  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) throw new Error("RAZORPAY_KEY_ID is not set.");
  return { orderId: order.id, amountInPaise: order.amount, currency: order.currency, keyId };
}

/** Actually applies a paid extension: pushes out the Daily.co room's
 * expiry and records the extra minutes on the Session. Called once
 * payment for an EXTENSION-type Payment is confirmed. */
export async function applyExtension(bookingId: string, minutes: number): Promise<void> {
  const booking = await requireCallableBooking(bookingId);
  const session = await prisma.session.findUnique({ where: { bookingId: booking.id } });
  if (!session?.roomId) throw new BookingError("No active call session to extend.");

  const newExtensionMinutes = session.extensionMinutes + minutes;
  const newEndUtc = istWallClockToUtc(booking.date, booking.startTime + booking.duration + newExtensionMinutes);
  const newExpUnix = Math.floor(newEndUtc.getTime() / 1000) + ROOM_EXP_BUFFER_SECONDS;

  await updateRoomExp(session.roomId, newExpUnix);
  await prisma.session.update({ where: { id: session.id }, data: { extensionMinutes: newExtensionMinutes } });
}
