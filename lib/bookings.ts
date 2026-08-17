// The real booking system: request -> JUM's manual approval -> payment
// hold -> confirmed. Mirrors the prototype's UX (see JUM prototype
// bilingual.html's #confirm and #payment pages) but as a real state
// machine backed by the DB, not client-side simulation.
//
// State machine (see prisma/schema.prisma for the authoritative comment):
//   PENDING_APPROVAL -> TEMPORARILY_HELD -> PAYMENT_PENDING -> CONFIRMED -> COMPLETED
//   also: BOOKING_FAILED (declined, or either window expired)
//
// Double-booking is prevented at the database level by a partial unique
// index on (date, startTime) covering all three "active" statuses plus
// PENDING_APPROVAL (see prisma/migrations/*_slot_unique_index*) — the
// pre-insert availability check below is a fast-path UX check, not the
// actual guarantee.

import { prisma } from "./prisma";
import { getAvailableStartTimes } from "./availability";
import { DURATION_PRICING_INR } from "./pricing";
import { BookingStatus, PaymentStatus, type CallMethod } from "../app/generated/prisma/client";
import type { Booking } from "../app/generated/prisma/client";

export { DURATION_PRICING_INR } from "./pricing";

export const APPROVAL_WINDOW_MINUTES = 15; // time JUM has to accept/decline a request
export const PAYMENT_HOLD_MINUTES = 5; // time the customer has to pay once approved

export class BookingError extends Error {}
export class SlotUnavailableError extends BookingError {}
export class InvalidBookingStateError extends BookingError {}

const CALL_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — matches the prototype
function generateCallCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CALL_CODE_CHARS[Math.floor(Math.random() * CALL_CODE_CHARS.length)];
  }
  return `JUM-${code}`;
}

function isUniqueViolationOn(err: unknown, column: string): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } };
  if (e?.code !== "P2002") return false;
  const target = e.meta?.target;
  return Array.isArray(target) && target.includes(column);
}

export interface CreateBookingRequestInput {
  displayName: string;
  email: string;
  phone?: string;
  date: string; // YYYY-MM-DD
  startTime: number; // minutes since midnight
  duration: number; // minutes — must be a key of DURATION_PRICING_INR
  callMethod: CallMethod;
  sharedRealInfo: boolean;
  notes?: string;
}

/** Creates a PENDING_APPROVAL booking request. Throws SlotUnavailableError
 * if the slot isn't actually open (checked against live availability, and
 * ultimately enforced by the DB's partial unique index against races). */
export async function createBookingRequest(input: CreateBookingRequestInput): Promise<Booking> {
  const amountInr = DURATION_PRICING_INR[input.duration];
  if (amountInr === undefined) {
    throw new BookingError(`Unsupported duration ${input.duration}. Valid options: ${Object.keys(DURATION_PRICING_INR).join(", ")} minutes.`);
  }

  const openStarts = await getAvailableStartTimes(input.date, input.duration);
  if (!openStarts.includes(input.startTime)) {
    throw new SlotUnavailableError(`${input.date} at minute ${input.startTime} is not available for a ${input.duration}-minute session.`);
  }

  let user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    user = await prisma.user.create({
      data: { displayName: input.displayName, email: input.email, phone: input.phone },
    });
  }

  const [year, month, day] = input.date.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const holdExpiresAt = new Date(Date.now() + APPROVAL_WINDOW_MINUTES * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.booking.create({
        data: {
          userId: user.id,
          date,
          startTime: input.startTime,
          endTime: input.startTime + input.duration,
          duration: input.duration,
          callMethod: input.callMethod,
          sharedRealInfo: input.sharedRealInfo,
          notes: input.notes,
          amountInr,
          callCode: generateCallCode(),
          bookingStatus: BookingStatus.PENDING_APPROVAL,
          holdExpiresAt,
        },
      });
    } catch (err) {
      if (isUniqueViolationOn(err, "callCode")) continue; // astronomically rare, but retry cleanly
      throw new SlotUnavailableError(`${input.date} at minute ${input.startTime} was just taken by another request.`);
    }
  }
  throw new BookingError("Could not generate a unique call code after several attempts.");
}

/** JUM accepts the request: PENDING_APPROVAL -> TEMPORARILY_HELD, starting the payment window. */
export async function approveBooking(id: string): Promise<Booking> {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new BookingError(`Booking ${id} not found.`);
  if (booking.bookingStatus !== BookingStatus.PENDING_APPROVAL) {
    throw new InvalidBookingStateError(`Booking ${id} is ${booking.bookingStatus}, not PENDING_APPROVAL.`);
  }
  if (!booking.holdExpiresAt || booking.holdExpiresAt.getTime() < Date.now()) {
    throw new InvalidBookingStateError(`Booking ${id}'s approval window already expired.`);
  }
  return prisma.booking.update({
    where: { id },
    data: {
      bookingStatus: BookingStatus.TEMPORARILY_HELD,
      holdExpiresAt: new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60 * 1000),
    },
  });
}

/** JUM declines the request: PENDING_APPROVAL -> BOOKING_FAILED. */
export async function declineBooking(id: string): Promise<Booking> {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new BookingError(`Booking ${id} not found.`);
  if (booking.bookingStatus !== BookingStatus.PENDING_APPROVAL) {
    throw new InvalidBookingStateError(`Booking ${id} is ${booking.bookingStatus}, not PENDING_APPROVAL.`);
  }
  return prisma.booking.update({
    where: { id },
    data: { bookingStatus: BookingStatus.BOOKING_FAILED },
  });
}

/** Marks a booking paid and confirmed, strictly (throws if the payment
 * window already expired). Real payment confirmation goes through
 * confirmBookingIfPending() below via lib/payments.ts instead — this
 * stricter variant exists for test scripts, not exposed over HTTP
 * (deliberately: an API route here would let anyone with admin access
 * confirm a booking with no real payment, see PROJECT_STATUS.md's
 * security review). */
export async function confirmBooking(id: string): Promise<Booking> {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new BookingError(`Booking ${id} not found.`);
  if (booking.bookingStatus !== BookingStatus.TEMPORARILY_HELD && booking.bookingStatus !== BookingStatus.PAYMENT_PENDING) {
    throw new InvalidBookingStateError(`Booking ${id} is ${booking.bookingStatus}, not TEMPORARILY_HELD or PAYMENT_PENDING.`);
  }
  if (!booking.holdExpiresAt || booking.holdExpiresAt.getTime() < Date.now()) {
    throw new InvalidBookingStateError(`Booking ${id}'s payment window already expired.`);
  }
  return prisma.booking.update({
    where: { id },
    data: { bookingStatus: BookingStatus.CONFIRMED, paymentStatus: PaymentStatus.SUCCESSFUL },
  });
}

/** Requests JUM hasn't acted on within the response/payment window.
 * There's no real-time notification system yet (that's Phase 5), so until
 * then this list has to be checked manually/polled. */
export async function listPendingApprovals() {
  return prisma.booking.findMany({
    where: { bookingStatus: BookingStatus.PENDING_APPROVAL, holdExpiresAt: { gt: new Date() } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Sweeps requests/holds whose window has passed without action, flipping
 * them to BOOKING_FAILED so the slot frees up for others. Meant to be run
 * on a schedule (Azure Function timer trigger, once deployed) — for now,
 * run scripts/expire-stale-bookings.ts by hand or on a cron of your own. */
export async function expireStaleHolds(): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: {
      bookingStatus: { in: [BookingStatus.PENDING_APPROVAL, BookingStatus.TEMPORARILY_HELD, BookingStatus.PAYMENT_PENDING] },
      holdExpiresAt: { lt: new Date() },
    },
    data: { bookingStatus: BookingStatus.BOOKING_FAILED },
  });
  return result.count;
}

/** Moves a booking to CONFIRMED if it isn't already — used by the payment
 * verify/webhook paths (lib/payments.ts), which can both race to confirm
 * the same booking (Razorpay may retry webhook delivery, and the client
 * callback can arrive around the same time). Unlike confirmBooking(),
 * this treats "already CONFIRMED" as success rather than an error. */
export async function confirmBookingIfPending(id: string): Promise<Booking> {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new BookingError(`Booking ${id} not found.`);
  if (booking.bookingStatus === BookingStatus.CONFIRMED) return booking;
  if (booking.bookingStatus !== BookingStatus.TEMPORARILY_HELD && booking.bookingStatus !== BookingStatus.PAYMENT_PENDING) {
    throw new InvalidBookingStateError(`Booking ${id} is ${booking.bookingStatus}, not TEMPORARILY_HELD or PAYMENT_PENDING.`);
  }
  return prisma.booking.update({
    where: { id },
    data: { bookingStatus: BookingStatus.CONFIRMED, paymentStatus: PaymentStatus.SUCCESSFUL },
  });
}
