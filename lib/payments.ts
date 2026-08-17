// Real payment collection via Razorpay, plugging into the booking state
// machine's TEMPORARILY_HELD -> PAYMENT_PENDING -> CONFIRMED transition
// (see lib/bookings.ts). Two independent paths can confirm a booking —
// the client-side Checkout success callback (verifyAndConfirmPayment) and
// the async webhook (handleRazorpayWebhook) — both funnel through
// confirmBookingIfPending() so whichever arrives first wins and the other
// is a no-op, not an error.

import { prisma } from "./prisma";
import { createOrder, fetchPayment, verifyPaymentSignature, verifyWebhookSignature } from "./razorpay";
import { confirmBookingIfPending, BookingError, InvalidBookingStateError } from "./bookings";
import { BookingStatus, PaymentRecordStatus, PaymentType, PaymentMethod } from "../app/generated/prisma/enums";
import type { Payment } from "../app/generated/prisma/client";

export const PAYMENT_WINDOW_MINUTES = 10; // time to complete Razorpay Checkout once an order exists

function mapRazorpayMethod(method: string): PaymentMethod | null {
  switch (method) {
    case "upi":
      return PaymentMethod.UPI;
    case "card":
    case "emi":
      return PaymentMethod.CARD;
    case "netbanking":
      return PaymentMethod.NETBANKING;
    case "wallet":
      return PaymentMethod.WALLET;
    default:
      return null;
  }
}

export interface PaymentOrderInfo {
  orderId: string;
  amountInPaise: number;
  currency: string;
  keyId: string;
  holdExpiresAt: Date;
}

/** Creates (or reuses) a Razorpay order for a booking that's ready to be
 * paid, moving it into PAYMENT_PENDING with a fresh payment window. */
export async function initiatePayment(bookingId: string): Promise<PaymentOrderInfo> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new BookingError(`Booking ${bookingId} not found.`);

  if (booking.bookingStatus === BookingStatus.TEMPORARILY_HELD) {
    if (!booking.holdExpiresAt || booking.holdExpiresAt.getTime() < Date.now()) {
      throw new InvalidBookingStateError(`Booking ${bookingId}'s payment window already expired.`);
    }
    return createFreshOrder(booking.id, booking.amountInr, booking.callCode);
  }

  if (booking.bookingStatus === BookingStatus.PAYMENT_PENDING) {
    if (!booking.holdExpiresAt || booking.holdExpiresAt.getTime() < Date.now()) {
      throw new InvalidBookingStateError(`Booking ${bookingId}'s payment window already expired.`);
    }
    const existing = await prisma.payment.findFirst({
      where: { bookingId, status: PaymentRecordStatus.PENDING },
      orderBy: { createdAt: "desc" },
    });
    if (existing?.gatewayOrderId) {
      return {
        orderId: existing.gatewayOrderId,
        amountInPaise: existing.amountInr * 100,
        currency: "INR",
        keyId: requireKeyId(),
        holdExpiresAt: booking.holdExpiresAt,
      };
    }
    // Previous order failed (or somehow no order exists yet) — start a new one, same window.
    return createFreshOrder(booking.id, booking.amountInr, `${booking.callCode}-${Date.now().toString(36)}`);
  }

  throw new InvalidBookingStateError(`Booking ${bookingId} is ${booking.bookingStatus}, not ready for payment.`);
}

async function createFreshOrder(bookingId: string, amountInr: number, receipt: string): Promise<PaymentOrderInfo> {
  const order = await createOrder(amountInr, receipt, { bookingId });
  const holdExpiresAt = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        bookingId,
        type: PaymentType.SESSION,
        amountInr,
        status: PaymentRecordStatus.PENDING,
        gatewayOrderId: order.id,
      },
    }),
    prisma.booking.update({
      where: { id: bookingId },
      data: { bookingStatus: BookingStatus.PAYMENT_PENDING, holdExpiresAt },
    }),
  ]);

  return { orderId: order.id, amountInPaise: order.amount, currency: order.currency, keyId: requireKeyId(), holdExpiresAt };
}

function requireKeyId(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) throw new Error("RAZORPAY_KEY_ID is not set.");
  return keyId;
}

export interface VerifyPaymentInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/** The client-side (Checkout success handler) confirmation path. */
export async function verifyAndConfirmPayment(bookingId: string, input: VerifyPaymentInput) {
  const payment = await prisma.payment.findFirst({
    where: { bookingId, status: PaymentRecordStatus.PENDING },
    orderBy: { createdAt: "desc" },
  });
  if (!payment?.gatewayOrderId) {
    throw new BookingError(`Booking ${bookingId} has no pending payment to verify.`);
  }
  if (payment.gatewayOrderId !== input.razorpayOrderId) {
    throw new BookingError(`Order id mismatch for booking ${bookingId}.`);
  }
  if (!verifyPaymentSignature(payment.gatewayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
    throw new BookingError("Invalid payment signature.");
  }

  const method = await fetchPayment(input.razorpayPaymentId)
    .then((p) => mapRazorpayMethod(p.method))
    .catch(() => null); // best-effort — the payment is already verified regardless

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: PaymentRecordStatus.SUCCESSFUL, gatewayPaymentId: input.razorpayPaymentId, method: method ?? undefined },
  });

  return confirmBookingIfPending(bookingId);
}

/** The async, authoritative confirmation path — Razorpay calls this. */
export async function handleRazorpayWebhook(rawBody: string, signature: string | null): Promise<{ handled: boolean }> {
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    throw new BookingError("Invalid webhook signature.");
  }

  const event = JSON.parse(rawBody) as {
    event: string;
    payload: { payment: { entity: { id: string; order_id: string; method: string } } };
  };

  if (event.event !== "payment.captured" && event.event !== "payment.failed") {
    return { handled: false };
  }

  const entity = event.payload.payment.entity;
  const payment: Payment | null = await prisma.payment.findFirst({
    where: { gatewayOrderId: entity.order_id },
    orderBy: { createdAt: "desc" },
  });
  if (!payment || !payment.bookingId) return { handled: false };

  if (event.event === "payment.captured") {
    if (payment.status !== PaymentRecordStatus.SUCCESSFUL) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentRecordStatus.SUCCESSFUL,
          gatewayPaymentId: entity.id,
          method: mapRazorpayMethod(entity.method) ?? undefined,
        },
      });
    }
    await confirmBookingIfPending(payment.bookingId);
  } else if (event.event === "payment.failed") {
    if (payment.status === PaymentRecordStatus.PENDING) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentRecordStatus.FAILED } });
    }
  }

  return { handled: true };
}
