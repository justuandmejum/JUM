// One-off verification script for Phase 6 (Daily.co calling + extensions +
// feedback + donations) — not part of the app. Makes REAL network calls to
// both Daily.co (room/token creation, room exp updates) and Razorpay's
// test-mode API (order creation), so this needs valid DAILY_API_KEY and
// RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET in .env.
//
// The join-window and end-of-session checks in lib/calling.ts compare
// against the real clock, so — like scripts/test-cancellation.ts's
// setNoticeWindow — this rewrites booking date/startTime relative to the
// real "now" rather than using a fixed future test date. Extension-tier
// math also needs a real open availability window for whatever "now"
// happens to be, so this seeds (and cleans up) a temporary full-day
// DATE_OPEN rule for today's real IST date.
//
// Run with: npx tsx -r dotenv/config scripts/test-calling.ts
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { generateJoinToken, endSession, sendCallback, computeExtensionOptions, initiateExtensionOrder } from "../lib/calling";
import { verifyAndApplyExtensionPayment, handleRazorpayWebhook } from "../lib/payments";
import { createDonationOrder, verifyDonationPayment } from "../lib/donations";
import { submitFeedback } from "../lib/feedback";
import { BookingError, InvalidBookingStateError } from "../lib/bookings";
import { deleteRoom } from "../lib/daily";
import { BookingStatus, CallMethod, AvailabilityType, PaymentRecordStatus, PaymentType } from "../app/generated/prisma/enums";

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

function fakePaymentSignature(orderId: string, paymentId: string): string {
  return crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex");
}

// Mirrors lib/istTime.ts's inverse — given a target real instant, what IST
// (date, minutesSinceMidnight) does it fall on.
function utcToIstWallClock(d: Date): { date: Date; minutes: number } {
  const shifted = new Date(d.getTime() + 330 * 60_000);
  const date = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  return { date, minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

let codeCounter = 0;
function testCallCode(): string {
  codeCounter += 1;
  return `JUM-TEST${Date.now().toString(36).toUpperCase()}${codeCounter}`;
}

async function main() {
  const testUserIds: string[] = [];
  const testRoomNames: string[] = [];
  let tempRuleId: string | null = null;
  let standaloneDonationOrderId: string | null = null;

  // Cleanup lives in `finally` below (not just at the end of the happy
  // path) — a first pass that threw mid-script (a real Daily API error)
  // left orphaned test bookings sitting in the DB, which silently
  // corrupted a *later* run's extension-tier math (see PROJECT_STATUS.md).
  async function cleanup() {
    for (const roomName of testRoomNames) {
      try {
        await deleteRoom(roomName);
      } catch (err) {
        console.warn(`  (cleanup) could not delete Daily room ${roomName}:`, err);
      }
    }
    await prisma.feedback.deleteMany({ where: { booking: { userId: { in: testUserIds } } } });
    await prisma.session.deleteMany({ where: { booking: { userId: { in: testUserIds } } } });
    await prisma.payment.deleteMany({ where: { booking: { userId: { in: testUserIds } } } });
    if (standaloneDonationOrderId) await prisma.payment.deleteMany({ where: { gatewayOrderId: standaloneDonationOrderId } });
    await prisma.booking.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    if (tempRuleId) await prisma.availabilityRule.delete({ where: { id: tempRuleId } });
    console.log("\nCleaned up test data (including real Daily.co test rooms).");
  }

  const nowIst = utcToIstWallClock(new Date());
  const tempRule = await prisma.availabilityRule.create({
    data: { type: AvailabilityType.DATE_OPEN, date: nowIst.date, startMinutes: 0, endMinutes: 1439, reason: "test-calling.ts" },
  });
  tempRuleId = tempRule.id;

  async function createBooking(opts: { startTime: number; duration: number; callMethod: CallMethod; status: BookingStatus }) {
    const user = await prisma.user.create({ data: { displayName: "Calling Test Customer", email: `calling-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com` } });
    testUserIds.push(user.id);
    const startTime = ((opts.startTime % 1440) + 1440) % 1440; // clamp into a valid day, in case "now" is near midnight
    return prisma.booking.create({
      data: {
        userId: user.id,
        date: nowIst.date,
        startTime,
        endTime: startTime + opts.duration,
        duration: opts.duration,
        callMethod: opts.callMethod,
        sharedRealInfo: false,
        amountInr: 349,
        callCode: testCallCode(),
        bookingStatus: opts.status,
        paymentStatus: "SUCCESSFUL",
      },
    });
  }

  try {
    // The one booking most of this script exercises: already started 5
    // minutes ago (so "now" is comfortably inside its join window), 30
    // minutes long, JUM calling method, CONFIRMED.
    const callBooking = await createBooking({ startTime: nowIst.minutes - 5, duration: 30, callMethod: CallMethod.JUM, status: BookingStatus.CONFIRMED });

    // --- 0. Gating: wrong status / wrong call method ------------------------------
    console.log(`\n[0] requireCallableBooking gating`);
    const notConfirmed = await createBooking({ startTime: nowIst.minutes - 200, duration: 30, callMethod: CallMethod.JUM, status: BookingStatus.PENDING_APPROVAL });
    let rejectedStatus = false;
    try {
      await generateJoinToken(notConfirmed.id, false);
    } catch (err) {
      rejectedStatus = err instanceof InvalidBookingStateError;
    }
    check("non-CONFIRMED booking rejected", rejectedStatus);

    const externalPlatform = await createBooking({ startTime: nowIst.minutes - 260, duration: 30, callMethod: CallMethod.GOOGLE_MEET, status: BookingStatus.CONFIRMED });
    let rejectedMethod = false;
    try {
      await generateJoinToken(externalPlatform.id, false);
    } catch (err) {
      rejectedMethod = err instanceof BookingError && !(err instanceof InvalidBookingStateError);
    }
    check("non-JUM call method rejected", rejectedMethod);

    // --- A. Join window -----------------------------------------------------------
    console.log(`\n[A] Join window enforcement`);
    const tooEarly = await createBooking({ startTime: nowIst.minutes + 20, duration: 30, callMethod: CallMethod.JUM, status: BookingStatus.CONFIRMED });
    let rejectedEarly = false;
    try {
      await generateJoinToken(tooEarly.id, false);
    } catch (err) {
      rejectedEarly = err instanceof InvalidBookingStateError;
    }
    check("joining >10 min before start is rejected", rejectedEarly);

    const tooLate = await createBooking({ startTime: nowIst.minutes - 60, duration: 30, callMethod: CallMethod.JUM, status: BookingStatus.CONFIRMED });
    let rejectedLate = false;
    try {
      await generateJoinToken(tooLate.id, false);
    } catch (err) {
      rejectedLate = err instanceof InvalidBookingStateError;
    }
    check("joining after the session has ended is rejected", rejectedLate);

    const customerJoin = await generateJoinToken(callBooking.id, false);
    check("customer join returns a real Daily room URL", /^https:\/\/[a-z0-9-]+\.daily\.co\/jum-/.test(customerJoin.url));
    check("customer join returns a token", typeof customerJoin.token === "string" && customerJoin.token.length > 20);
    const sessionAfterCustomerJoin = await prisma.session.findUnique({ where: { bookingId: callBooking.id } });
    if (sessionAfterCustomerJoin?.roomId) testRoomNames.push(sessionAfterCustomerJoin.roomId);

    const hostJoin = await generateJoinToken(callBooking.id, true);
    check("host join returns the same room URL", hostJoin.url === customerJoin.url);
    check("host token differs from customer token", hostJoin.token !== customerJoin.token);

    // --- B. Room/session reuse is idempotent ---------------------------------------
    console.log(`\n[B] Repeated joins reuse the same room`);
    const sessionsForBooking = await prisma.session.findMany({ where: { bookingId: callBooking.id } });
    check("exactly one Session row exists for this booking", sessionsForBooking.length === 1);
    const rejoin = await generateJoinToken(callBooking.id, false);
    check("rejoining returns the same room URL", rejoin.url === customerJoin.url);

    // --- C. Extension tiers + payment ------------------------------------------------
    console.log(`\n[C] Extension options + payment`);
    const callBookingEnd = nowIst.minutes - 5 + 30; // callBooking's scheduled end
    const nextBookingGapMinutes = 20;
    const nextBooking = await createBooking({
      startTime: callBookingEnd + nextBookingGapMinutes,
      duration: 30,
      callMethod: CallMethod.JUM,
      status: BookingStatus.CONFIRMED,
    });

    const options = await computeExtensionOptions(callBooking.id);
    check(`freeMinutes matches the real gap before the next booking (${nextBookingGapMinutes})`, options.freeMinutes === nextBookingGapMinutes);
    check("only tiers <= freeMinutes are offered", options.options.every((o) => o.minutes <= nextBookingGapMinutes));
    check("the 15-min tier is offered", options.options.some((o) => o.minutes === 15));
    check("the 30-min tier is NOT offered (doesn't fit)", !options.options.some((o) => o.minutes === 30));

    let rejectedTooLongExtension = false;
    try {
      await initiateExtensionOrder(callBooking.id, 30);
    } catch (err) {
      rejectedTooLongExtension = err instanceof BookingError;
    }
    check("ordering an extension that doesn't fit is rejected", rejectedTooLongExtension);

    const extOrder = await initiateExtensionOrder(callBooking.id, 15);
    check("extension order id looks like a Razorpay order", extOrder.orderId.startsWith("order_"));
    const extPayment = await prisma.payment.findFirst({ where: { gatewayOrderId: extOrder.orderId } });
    check("Payment row created with type EXTENSION", extPayment?.type === PaymentType.EXTENSION);

    const sessionBeforeExtend = await prisma.session.findUnique({ where: { bookingId: callBooking.id } });
    const extPaymentId = "pay_faketest_ext_1";
    const extSig = fakePaymentSignature(extOrder.orderId, extPaymentId);
    await verifyAndApplyExtensionPayment(callBooking.id, 15, { razorpayOrderId: extOrder.orderId, razorpayPaymentId: extPaymentId, razorpaySignature: extSig });
    const sessionAfterExtend = await prisma.session.findUnique({ where: { bookingId: callBooking.id } });
    check("extensionMinutes increased by 15", (sessionAfterExtend?.extensionMinutes ?? 0) === (sessionBeforeExtend?.extensionMinutes ?? 0) + 15);

    // Re-verifying the same (now-successful) payment must not double-apply.
    await verifyAndApplyExtensionPayment(callBooking.id, 15, { razorpayOrderId: extOrder.orderId, razorpayPaymentId: extPaymentId, razorpaySignature: extSig });
    const sessionAfterReverify = await prisma.session.findUnique({ where: { bookingId: callBooking.id } });
    check("re-verifying an already-successful extension payment doesn't double-extend", sessionAfterReverify?.extensionMinutes === sessionAfterExtend?.extensionMinutes);

    // --- D. Dropped-call callback ----------------------------------------------------
    console.log(`\n[D] Callback (dropped-call recovery)`);
    const callbackJoin = await sendCallback(callBooking.id);
    check("callback returns a fresh join for the customer", callbackJoin.url === customerJoin.url);
    const sessionAfterCallback = await prisma.session.findUnique({ where: { bookingId: callBooking.id } });
    check("callbackUsed is now true", sessionAfterCallback?.callbackUsed === true);
    check("session is ACTIVE again after the customer's fresh join", sessionAfterCallback?.status === "ACTIVE");

    let rejectedSecondCallback = false;
    try {
      await sendCallback(callBooking.id);
    } catch (err) {
      rejectedSecondCallback = err instanceof InvalidBookingStateError;
    }
    check("a second callback for the same session is rejected", rejectedSecondCallback);

    // --- E. Ending the session ---------------------------------------------------------
    console.log(`\n[E] Ending the session`);
    await endSession(callBooking.id);
    const bookingAfterEnd = await prisma.booking.findUnique({ where: { id: callBooking.id } });
    check("booking is COMPLETED", bookingAfterEnd?.bookingStatus === BookingStatus.COMPLETED);
    const sessionAfterEnd = await prisma.session.findUnique({ where: { bookingId: callBooking.id } });
    check("session is COMPLETED", sessionAfterEnd?.status === "COMPLETED");

    let rejectedJoinAfterEnd = false;
    try {
      await generateJoinToken(callBooking.id, false);
    } catch (err) {
      rejectedJoinAfterEnd = err instanceof InvalidBookingStateError;
    }
    check("joining after COMPLETED is rejected", rejectedJoinAfterEnd);

    // --- F. Feedback -----------------------------------------------------------------
    console.log(`\n[F] Feedback`);
    let rejectedFeedbackNotCompleted = false;
    try {
      await submitFeedback(nextBooking.id, 5); // CONFIRMED, not COMPLETED
    } catch (err) {
      rejectedFeedbackNotCompleted = err instanceof InvalidBookingStateError;
    }
    check("feedback rejected before the session is COMPLETED", rejectedFeedbackNotCompleted);

    let rejectedBadRating = false;
    try {
      await submitFeedback(callBooking.id, 0);
    } catch (err) {
      rejectedBadRating = err instanceof BookingError;
    }
    check("rating of 0 is rejected", rejectedBadRating);

    const feedback = await submitFeedback(callBooking.id, 5, "  Really valuable conversation.  ");
    check("feedback recorded with the given rating", feedback.rating === 5);
    check("comment is trimmed", feedback.comment === "Really valuable conversation.");

    let rejectedDuplicateFeedback = false;
    try {
      await submitFeedback(callBooking.id, 4);
    } catch (err) {
      rejectedDuplicateFeedback = err instanceof InvalidBookingStateError;
    }
    check("a second feedback submission for the same booking is rejected", rejectedDuplicateFeedback);

    // --- G. Donations ------------------------------------------------------------------
    console.log(`\n[G] Donations`);
    let rejectedZeroDonation = false;
    try {
      await createDonationOrder(0, callBooking.id);
    } catch (err) {
      rejectedZeroDonation = err instanceof BookingError;
    }
    check("a ₹0 donation is rejected", rejectedZeroDonation);

    const donationOrder = await createDonationOrder(199, callBooking.id);
    check("donation order id looks like a Razorpay order", donationOrder.orderId.startsWith("order_"));
    const donationPaymentId = "pay_faketest_donation_1";
    const donationSig = fakePaymentSignature(donationOrder.orderId, donationPaymentId);

    let rejectedBadDonationSig = false;
    try {
      await verifyDonationPayment({ razorpayOrderId: donationOrder.orderId, razorpayPaymentId: donationPaymentId, razorpaySignature: "0".repeat(64) }, callBooking.id);
    } catch (err) {
      rejectedBadDonationSig = err instanceof BookingError;
    }
    check("a tampered donation signature is rejected", rejectedBadDonationSig);

    await verifyDonationPayment({ razorpayOrderId: donationOrder.orderId, razorpayPaymentId: donationPaymentId, razorpaySignature: donationSig }, callBooking.id);
    const donationPaymentRow = await prisma.payment.findFirst({ where: { gatewayOrderId: donationOrder.orderId } });
    check("donation payment marked SUCCESSFUL", donationPaymentRow?.status === PaymentRecordStatus.SUCCESSFUL);
    check(
      "booking is unaffected by the donation (still COMPLETED, not re-confirmed)",
      (await prisma.booking.findUnique({ where: { id: callBooking.id } }))?.bookingStatus === BookingStatus.COMPLETED
    );

    // --- H. Webhook branches on Payment.type ---------------------------------------------
    console.log(`\n[H] Webhook branches correctly on Payment.type`);
    // Reuses callBooking's original (date, startTime) — safe because
    // callBooking is COMPLETED by now, which the partial unique index on
    // active bookings doesn't cover — and needs to be live (not just any
    // free slot) since generateJoinToken enforces the real join window.
    const webhookBooking = await createBooking({ startTime: nowIst.minutes - 5, duration: 30, callMethod: CallMethod.JUM, status: BookingStatus.CONFIRMED });
    await generateJoinToken(webhookBooking.id, false);
    const webhookSession = await prisma.session.findUnique({ where: { bookingId: webhookBooking.id } });
    if (webhookSession?.roomId) testRoomNames.push(webhookSession.roomId);

    const webhookExtOrder = await initiateExtensionOrder(webhookBooking.id, 15);
    const webhookExtPaymentId = "pay_faketest_webhook_ext_1";
    const webhookExtBody = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: webhookExtPaymentId, order_id: webhookExtOrder.orderId, method: "upi" } } },
    });
    await handleRazorpayWebhook(webhookExtBody, signWebhookBody(webhookExtBody));
    const webhookSessionAfterExt = await prisma.session.findUnique({ where: { bookingId: webhookBooking.id } });
    check("EXTENSION webhook applied the extension via a real Daily API call", webhookSessionAfterExt?.extensionMinutes === 15);

    // Re-delivery (Razorpay retries webhooks) must not double-apply.
    await handleRazorpayWebhook(webhookExtBody, signWebhookBody(webhookExtBody));
    const webhookSessionAfterRetry = await prisma.session.findUnique({ where: { bookingId: webhookBooking.id } });
    check("redelivered EXTENSION webhook is idempotent", webhookSessionAfterRetry?.extensionMinutes === 15);

    const standaloneDonationOrder = await createDonationOrder(50); // no bookingId — a donation isn't necessarily tied to one
    standaloneDonationOrderId = standaloneDonationOrder.orderId;
    const donationWebhookPaymentId = "pay_faketest_webhook_donation_1";
    const donationWebhookBody = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: donationWebhookPaymentId, order_id: standaloneDonationOrder.orderId, method: "card" } } },
    });
    await handleRazorpayWebhook(donationWebhookBody, signWebhookBody(donationWebhookBody));
    const standaloneDonationPayment = await prisma.payment.findFirst({ where: { gatewayOrderId: standaloneDonationOrder.orderId } });
    check("standalone DONATION webhook marks the payment SUCCESSFUL", standaloneDonationPayment?.status === PaymentRecordStatus.SUCCESSFUL);
    check("standalone donation has no bookingId", standaloneDonationPayment?.bookingId === null);

    const webhookBookingAfterDonation = await prisma.booking.findUnique({ where: { id: webhookBooking.id } });
    check("webhookBooking still CONFIRMED (donation webhook didn't touch it)", webhookBookingAfterDonation?.bookingStatus === BookingStatus.CONFIRMED);
  } finally {
    await cleanup();
  }

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
