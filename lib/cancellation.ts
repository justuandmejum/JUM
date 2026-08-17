// Cancellation, with the refund tiers already published on
// /legal/refund honored for real — not just documented copy. See that
// policy's exact wording (lib/i18n/en.json "legal.refund.body") for the
// tiers this implements:
//   >24h before session: 100% · 12-24h: 50% · 6-12h: 25% · <6h: 0%
// A JUM-initiated cancellation (the host cancels a confirmed session) is
// always a full refund, per the same policy's "If JUM Cannot Confirm
// Your Session" section.

import { prisma } from "./prisma";
import { createRefund } from "./razorpay";
import { BookingError, InvalidBookingStateError } from "./bookings";
import { BookingStatus, PaymentRecordStatus } from "../app/generated/prisma/enums";
import type { Booking, Payment } from "../app/generated/prisma/client";

const CANCELLABLE_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING_APPROVAL,
  BookingStatus.TEMPORARILY_HELD,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.CONFIRMED,
];

/** The real UTC instant a booking's session starts. `date` is stored as a
 * UTC-midnight stand-in for the IST calendar date (see lib/availability.ts),
 * and `startTime` is IST minutes-since-midnight — so the real instant is
 * that date/time shifted back by the +330min IST offset. */
function sessionStartUtc(booking: Pick<Booking, "date" | "startTime">): Date {
  return new Date(booking.date.getTime() + booking.startTime * 60_000 - 330 * 60_000);
}

export function refundPercentForHoursNotice(hoursUntilSession: number): number {
  if (hoursUntilSession > 24) return 100;
  if (hoursUntilSession >= 12) return 50;
  if (hoursUntilSession >= 6) return 25;
  return 0;
}

export interface CancellationResult {
  booking: Booking;
  refundPercent: number;
  refundedInr: number;
}

async function findSuccessfulPayment(bookingId: string): Promise<Payment | null> {
  return prisma.payment.findFirst({
    where: { bookingId, status: PaymentRecordStatus.SUCCESSFUL },
    orderBy: { createdAt: "desc" },
  });
}

async function applyRefund(payment: Payment, percent: number, receiptSuffix: string): Promise<number> {
  if (percent <= 0) return 0;
  const refundInr = Math.round((payment.amountInr * percent) / 100);

  let refund;
  try {
    refund = await createRefund(
      payment.gatewayPaymentId!,
      percent < 100 ? refundInr * 100 : undefined, // omit amount entirely for a full refund
      `${payment.id}-${receiptSuffix}`.slice(0, 40)
    );
  } catch (err) {
    // Deliberately don't cancel the booking if the refund itself failed —
    // stranding a customer with neither the session nor their money back
    // would be worse than leaving the booking as-is. Surface a clean,
    // actionable error instead of letting the raw gateway error bubble up.
    const detail = err instanceof Error ? err.message : String(err);
    throw new BookingError(`Could not process the refund automatically (${detail}). Please email hello@justuandme.in with your booking id and we'll sort it out manually.`);
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: percent === 100 ? PaymentRecordStatus.REFUNDED : PaymentRecordStatus.PARTIALLY_REFUNDED,
      gatewayRefundId: refund.id,
    },
  });
  return refundInr;
}

/** Customer cancels their own booking. Refund tier depends on notice given. */
export async function cancelByCustomer(bookingId: string): Promise<CancellationResult> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new BookingError(`Booking ${bookingId} not found.`);
  if (!CANCELLABLE_STATUSES.includes(booking.bookingStatus)) {
    throw new InvalidBookingStateError(`Booking ${bookingId} is ${booking.bookingStatus} and can't be cancelled.`);
  }

  const hoursUntilSession = (sessionStartUtc(booking).getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilSession < 0) {
    throw new InvalidBookingStateError(`Booking ${bookingId}'s session time has already passed.`);
  }

  let refundedInr = 0;
  let refundPercent = 100; // moot if there's nothing to refund (no successful payment yet)
  if (booking.bookingStatus === BookingStatus.CONFIRMED) {
    refundPercent = refundPercentForHoursNotice(hoursUntilSession);
    const payment = await findSuccessfulPayment(bookingId);
    if (payment) refundedInr = await applyRefund(payment, refundPercent, "customer-cancel");
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { bookingStatus: BookingStatus.CUSTOMER_CANCELLED },
  });

  return { booking: updated, refundPercent, refundedInr };
}

/** JUM cancels a confirmed session (emergency, unavailability, etc.) — always a full refund. */
export async function cancelByAdmin(bookingId: string): Promise<CancellationResult> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new BookingError(`Booking ${bookingId} not found.`);
  if (booking.bookingStatus !== BookingStatus.CONFIRMED) {
    throw new InvalidBookingStateError(`Booking ${bookingId} is ${booking.bookingStatus}, not CONFIRMED.`);
  }

  let refundedInr = 0;
  const payment = await findSuccessfulPayment(bookingId);
  if (payment) refundedInr = await applyRefund(payment, 100, "jum-cancel");

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { bookingStatus: BookingStatus.JUM_CANCELLED },
  });

  return { booking: updated, refundPercent: 100, refundedInr };
}
