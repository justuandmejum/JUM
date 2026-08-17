// Sustainability donations — a separate, optional payment flow from the
// post-call feedback page (see the prototype's #feedback "Felt like more?"
// panel). Freeform amount chosen by the customer (min ₹1, no upper bound,
// no fixed tiers), not part of what JUM or the listener earns. Unlike
// session/extension payments, a donation isn't gated by any booking state
// machine transition — it's just money changing hands.

import { prisma } from "./prisma";
import { createOrder } from "./razorpay";
import { verifyAndMarkPaymentSuccessful, type VerifyPaymentInput } from "./payments";
import { BookingError } from "./bookings";
import { PaymentRecordStatus, PaymentType } from "../app/generated/prisma/enums";

export interface DonationOrderInfo {
  orderId: string;
  amountInPaise: number;
  currency: string;
  keyId: string;
}

/** bookingId is optional — recorded when the donation happens right after
 * a specific session, but a donation isn't required to be tied to one. */
export async function createDonationOrder(amountInr: number, bookingId?: string): Promise<DonationOrderInfo> {
  if (!Number.isInteger(amountInr) || amountInr < 1) {
    throw new BookingError("Donation amount must be a whole number of at least ₹1.");
  }

  const order = await createOrder(amountInr, `donation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, {
    ...(bookingId ? { bookingId } : {}),
    donation: "true",
  });

  await prisma.payment.create({
    data: {
      bookingId: bookingId ?? undefined,
      type: PaymentType.DONATION,
      amountInr,
      status: PaymentRecordStatus.PENDING,
      gatewayOrderId: order.id,
    },
  });

  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) throw new Error("RAZORPAY_KEY_ID is not set.");
  return { orderId: order.id, amountInPaise: order.amount, currency: order.currency, keyId };
}

/** The client-side confirmation path — mirrors verifyAndConfirmPayment in
 * lib/payments.ts, but a donation has no booking state to advance once
 * marked successful. The authoritative path is still the Razorpay webhook
 * (lib/payments.ts's handleRazorpayWebhook), same as every other payment
 * type — this is just the fast, responsive-UI confirmation. */
export async function verifyDonationPayment(input: VerifyPaymentInput, bookingId?: string): Promise<void> {
  const { payment } = await verifyAndMarkPaymentSuccessful(PaymentType.DONATION, input);
  if (bookingId && payment.bookingId !== bookingId) {
    throw new BookingError(`Order ${input.razorpayOrderId} does not belong to booking ${bookingId}.`);
  }
}
