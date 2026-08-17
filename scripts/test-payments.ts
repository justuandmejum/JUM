// One-off verification script for Razorpay payment integration — not part
// of the app. Makes REAL network calls to Razorpay's test-mode API (order
// creation), so this needs valid RAZORPAY_KEY_ID/SECRET in .env.
// Run with: npx tsx -r dotenv/config scripts/test-payments.ts
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { getAvailableStartTimes } from "../lib/availability";
import { createBookingRequest, approveBooking, expireStaleHolds, BookingError } from "../lib/bookings";
import { initiatePayment, verifyAndConfirmPayment, handleRazorpayWebhook } from "../lib/payments";
import { verifyPaymentSignature } from "../lib/razorpay";
import { BookingStatus, PaymentRecordStatus } from "../app/generated/prisma/enums";

const TEST_DATE = "2026-09-18"; // a Friday, far enough out to not collide with real bookings
const TEST_EMAIL = `payment-test-${Date.now()}@example.com`;

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  OK   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}`);
  }
}

function signWebhookBody(rawBody: string): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

async function newApprovedBooking(startTime: number) {
  const req = await createBookingRequest({
    displayName: "Payment Test Customer",
    email: TEST_EMAIL,
    date: TEST_DATE,
    startTime,
    duration: 30,
    callMethod: "JUM",
    sharedRealInfo: false,
  });
  return approveBooking(req.id);
}

async function main() {
  const testUserIds: string[] = [];

  // --- A. Can't pay before approval -------------------------------------------
  console.log(`\n[A] Can't initiate payment before approval`);
  const unapproved = await createBookingRequest({
    displayName: "Payment Test Customer",
    email: TEST_EMAIL,
    date: TEST_DATE,
    startTime: 540,
    duration: 30,
    callMethod: "JUM",
    sharedRealInfo: false,
  });
  testUserIds.push(unapproved.userId);
  let rejectedEarly = false;
  try {
    await initiatePayment(unapproved.id);
  } catch (err) {
    rejectedEarly = err instanceof BookingError;
  }
  check("payment rejected while still PENDING_APPROVAL", rejectedEarly);

  // --- B. Real order creation against Razorpay's test API ----------------------
  console.log(`\n[B] Create a real Razorpay order (test mode)`);
  const bookingB = await newApprovedBooking(570);
  testUserIds.push(bookingB.userId);
  const order = await initiatePayment(bookingB.id);
  check("orderId looks like a Razorpay order", order.orderId.startsWith("order_"));
  check("amountInPaise matches booking amount", order.amountInPaise === bookingB.amountInr * 100);
  check("currency is INR", order.currency === "INR");
  check("keyId matches env", order.keyId === process.env.RAZORPAY_KEY_ID);

  const afterOrder = await prisma.booking.findUnique({ where: { id: bookingB.id } });
  check("booking moved to PAYMENT_PENDING", afterOrder?.bookingStatus === BookingStatus.PAYMENT_PENDING);

  const payment = await prisma.payment.findFirst({ where: { bookingId: bookingB.id } });
  check("a Payment row exists with the order id", payment?.gatewayOrderId === order.orderId);
  check("Payment status is PENDING", payment?.status === PaymentRecordStatus.PENDING);

  const blockedNow = await getAvailableStartTimes(TEST_DATE, 30);
  check("its slot (570) is blocked while PAYMENT_PENDING", !blockedNow.includes(570));

  // --- C. Re-initiating reuses the same order -----------------------------------
  console.log(`\n[C] Re-initiating payment reuses the pending order`);
  const orderAgain = await initiatePayment(bookingB.id);
  check("same orderId returned", orderAgain.orderId === order.orderId);

  // --- D. Wrong signature is rejected ---------------------------------------------
  console.log(`\n[D] Wrong signature rejected`);
  let wrongSigRejected = false;
  try {
    await verifyAndConfirmPayment(bookingB.id, {
      razorpayOrderId: order.orderId,
      razorpayPaymentId: "pay_fakefakefake1",
      razorpaySignature: "0".repeat(64),
    });
  } catch (err) {
    wrongSigRejected = err instanceof BookingError;
  }
  check("tampered signature rejected", wrongSigRejected);
  const stillPending = await prisma.booking.findUnique({ where: { id: bookingB.id } });
  check("booking still PAYMENT_PENDING after rejected verify", stillPending?.bookingStatus === BookingStatus.PAYMENT_PENDING);

  // --- E. Correct signature confirms the booking -----------------------------------
  console.log(`\n[E] Correct signature confirms the booking`);
  const fakePaymentId = "pay_faketest0000001";
  const validSig = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${order.orderId}|${fakePaymentId}`).digest("hex");
  check("verifyPaymentSignature agrees with our own computation", verifyPaymentSignature(order.orderId, fakePaymentId, validSig));

  const confirmed = await verifyAndConfirmPayment(bookingB.id, {
    razorpayOrderId: order.orderId,
    razorpayPaymentId: fakePaymentId,
    razorpaySignature: validSig,
  });
  check("booking is CONFIRMED", confirmed.bookingStatus === BookingStatus.CONFIRMED);
  check("paymentStatus is SUCCESSFUL", confirmed.paymentStatus === "SUCCESSFUL");
  const paymentAfterVerify = await prisma.payment.findFirst({ where: { bookingId: bookingB.id } });
  check("Payment row is SUCCESSFUL with gatewayPaymentId set", paymentAfterVerify?.status === PaymentRecordStatus.SUCCESSFUL && paymentAfterVerify?.gatewayPaymentId === fakePaymentId);

  // --- F. Webhook is idempotent against an already-confirmed booking ----------------
  console.log(`\n[F] Webhook idempotency on an already-confirmed booking`);
  const dupeBody = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: fakePaymentId, order_id: order.orderId, method: "upi" } } },
  });
  const dupeResult = await handleRazorpayWebhook(dupeBody, signWebhookBody(dupeBody));
  check("duplicate webhook handled without error", dupeResult.handled === true);
  const stillConfirmed = await prisma.booking.findUnique({ where: { id: bookingB.id } });
  check("booking still CONFIRMED (no-op, not an error)", stillConfirmed?.bookingStatus === BookingStatus.CONFIRMED);

  // --- G. Invalid webhook signature is rejected ---------------------------------------
  console.log(`\n[G] Invalid webhook signature rejected`);
  let webhookRejected = false;
  try {
    await handleRazorpayWebhook(dupeBody, "0".repeat(64));
  } catch (err) {
    webhookRejected = err instanceof BookingError;
  }
  check("tampered webhook signature rejected", webhookRejected);

  // --- H. Webhook confirms a fresh booking end-to-end, including method mapping -------
  console.log(`\n[H] Webhook confirms a fresh booking + maps payment method`);
  const bookingH = await newApprovedBooking(600);
  testUserIds.push(bookingH.userId);
  const orderH = await initiatePayment(bookingH.id);
  const paymentIdH = "pay_faketest0000002";
  const bodyH = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: paymentIdH, order_id: orderH.orderId, method: "upi" } } },
  });
  await handleRazorpayWebhook(bodyH, signWebhookBody(bodyH));
  const confirmedH = await prisma.booking.findUnique({ where: { id: bookingH.id } });
  check("booking H confirmed via webhook alone", confirmedH?.bookingStatus === BookingStatus.CONFIRMED);
  const paymentH = await prisma.payment.findFirst({ where: { bookingId: bookingH.id } });
  check("payment method mapped from webhook payload (upi -> UPI)", paymentH?.method === "UPI");

  // --- I. Failed payment lets the customer retry with a new order ----------------------
  console.log(`\n[I] Failed payment allows a retry order`);
  const bookingI = await newApprovedBooking(630);
  testUserIds.push(bookingI.userId);
  const orderI = await initiatePayment(bookingI.id);
  const failBodyI = JSON.stringify({
    event: "payment.failed",
    payload: { payment: { entity: { id: "pay_faketest0000003", order_id: orderI.orderId, method: "card" } } },
  });
  await handleRazorpayWebhook(failBodyI, signWebhookBody(failBodyI));
  const paymentIAfterFail = await prisma.payment.findFirst({ where: { bookingId: bookingI.id }, orderBy: { createdAt: "desc" } });
  check("payment marked FAILED", paymentIAfterFail?.status === PaymentRecordStatus.FAILED);
  const bookingIAfterFail = await prisma.booking.findUnique({ where: { id: bookingI.id } });
  check("booking still PAYMENT_PENDING after failed payment (can retry)", bookingIAfterFail?.bookingStatus === BookingStatus.PAYMENT_PENDING);

  const retryOrder = await initiatePayment(bookingI.id);
  check("retry creates a new order, not the failed one", retryOrder.orderId !== orderI.orderId);

  // --- J. Expiry sweep covers PAYMENT_PENDING too ---------------------------------------
  console.log(`\n[J] Expiry sweep covers stale PAYMENT_PENDING bookings`);
  const bookingJ = await newApprovedBooking(660);
  testUserIds.push(bookingJ.userId);
  await initiatePayment(bookingJ.id);
  await prisma.booking.update({ where: { id: bookingJ.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
  const expiredCount = await expireStaleHolds();
  check("expireStaleHolds swept at least our stale PAYMENT_PENDING booking", expiredCount >= 1);
  const bookingJAfter = await prisma.booking.findUnique({ where: { id: bookingJ.id } });
  check("swept booking is BOOKING_FAILED", bookingJAfter?.bookingStatus === BookingStatus.BOOKING_FAILED);
  const freedSlots = await getAvailableStartTimes(TEST_DATE, 30);
  check("its slot (660) is available again after sweep", freedSlots.includes(660));

  // --- Cleanup -----------------------------------------------------------------
  await prisma.payment.deleteMany({ where: { booking: { userId: { in: testUserIds } } } });
  await prisma.booking.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  console.log("\nCleaned up test data.");

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
