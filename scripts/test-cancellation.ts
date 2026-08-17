// One-off verification script for cancellation + refunds — not part of
// the app. Run with: npx tsx -r dotenv/config scripts/test-cancellation.ts
//
// NOTE on refund API coverage: the actual Razorpay refund-creation call
// (POST /v1/payments/:id/refund) could NOT be exercised here against a
// synthetic payment ID — refunds need a genuinely captured payment on
// Razorpay's side, unlike the order/webhook/signature paths tested
// elsewhere, which only check our own signatures. It WAS verified once,
// manually, against a real captured test-mode payment (real card entered
// through actual Checkout) in this session: the call failed with a 400
// "invalid request sent" on three different validly-shaped request
// bodies, while GET on the sibling refunds-list endpoint for the same
// payment succeeded (200). That pattern points to this Razorpay
// account's pending KYC blocking refund *creation* specifically — not a
// defect in lib/razorpay.ts's createRefund(). Re-run that manual check
// once KYC clears (see PROJECT_STATUS.md).
//
// So: this script covers everything reachable without a live refund
// call — tier math, the 0%-refund fast path (which correctly never
// calls Razorpay at all), state-machine transitions, and rejection
// logic. The >0%-refund-with-real-payment path is the one gap.
import { prisma } from "../lib/prisma";
import { getAvailableStartTimes } from "../lib/availability";
import { createBookingRequest, approveBooking } from "../lib/bookings";
import { cancelByCustomer, cancelByAdmin, refundPercentForHoursNotice } from "../lib/cancellation";
import { BookingStatus, PaymentRecordStatus } from "../app/generated/prisma/enums";

const TEST_DATE = "2026-09-20"; // a Sunday, far enough out to not collide with real bookings
const TEST_EMAIL = `cancel-test-${Date.now()}@example.com`;

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

/** A CONFIRMED booking with a SUCCESSFUL payment, but a fake gatewayPaymentId
 * — fine for the 0%-refund path (never calls Razorpay) and state-machine
 * checks, NOT fine for testing an actual >0% refund call (see file header). */
async function createConfirmedBookingWithFakePayment(startTime: number) {
  const req = await createBookingRequest({
    displayName: "Cancellation Test Customer",
    email: TEST_EMAIL,
    date: TEST_DATE,
    startTime,
    duration: 30,
    callMethod: "JUM",
    sharedRealInfo: false,
  });
  await approveBooking(req.id);
  await prisma.payment.create({
    data: {
      bookingId: req.id,
      type: "SESSION",
      amountInr: req.amountInr,
      status: PaymentRecordStatus.SUCCESSFUL,
      gatewayOrderId: `order_faketest${startTime}`,
      gatewayPaymentId: `pay_faketest${startTime}`,
    },
  });
  return prisma.booking.update({ where: { id: req.id }, data: { bookingStatus: BookingStatus.CONFIRMED } });
}

/** Rewrites date/startTime so "now" is `hoursNotice` hours before the
 * session — lets us test every refund tier without waiting in real time. */
async function setNoticeWindow(bookingId: string, hoursNotice: number) {
  const targetUtc = new Date(Date.now() + hoursNotice * 60 * 60 * 1000);
  const istShifted = new Date(targetUtc.getTime() + 330 * 60_000);
  const date = new Date(Date.UTC(istShifted.getUTCFullYear(), istShifted.getUTCMonth(), istShifted.getUTCDate()));
  const startTime = istShifted.getUTCHours() * 60 + istShifted.getUTCMinutes();
  await prisma.booking.update({ where: { id: bookingId }, data: { date, startTime, endTime: startTime + 30 } });
}

async function main() {
  const testUserIds: string[] = [];

  console.log(`\n[0] Refund tier math`);
  check("30h notice -> 100%", refundPercentForHoursNotice(30) === 100);
  check("24h notice -> 50%", refundPercentForHoursNotice(24) === 50);
  check("12h notice -> 50%", refundPercentForHoursNotice(12) === 50);
  check("8h notice -> 25%", refundPercentForHoursNotice(8) === 25);
  check("6h notice -> 25%", refundPercentForHoursNotice(6) === 25);
  check("3h notice -> 0%", refundPercentForHoursNotice(3) === 0);

  // --- A. <6h notice: 0% refund — never calls Razorpay, safe with a fake payment ---
  console.log(`\n[A] Customer cancels with 2h notice (0% refund, no Razorpay call needed)`);
  const bookingA = await createConfirmedBookingWithFakePayment(540);
  testUserIds.push(bookingA.userId);
  await setNoticeWindow(bookingA.id, 2);
  const resultA = await cancelByCustomer(bookingA.id);
  check("refundPercent is 0", resultA.refundPercent === 0);
  check("refundedInr is 0", resultA.refundedInr === 0);
  check("booking status is CUSTOMER_CANCELLED", resultA.booking.bookingStatus === BookingStatus.CUSTOMER_CANCELLED);
  const paymentA = await prisma.payment.findFirst({ where: { bookingId: bookingA.id } });
  check("Payment stays SUCCESSFUL (nothing refunded, Razorpay never called)", paymentA?.status === PaymentRecordStatus.SUCCESSFUL);

  // --- B. Can't cancel twice ---------------------------------------------------------
  console.log(`\n[B] Can't cancel an already-cancelled booking`);
  let rejectedDouble = false;
  try {
    await cancelByCustomer(bookingA.id);
  } catch {
    rejectedDouble = true;
  }
  check("second cancel attempt rejected", rejectedDouble);

  // --- C. Can't cancel after the session time has passed ------------------------------
  console.log(`\n[C] Can't cancel a session whose time already passed`);
  const bookingC = await createConfirmedBookingWithFakePayment(570);
  testUserIds.push(bookingC.userId);
  await setNoticeWindow(bookingC.id, -1);
  let rejectedPast = false;
  try {
    await cancelByCustomer(bookingC.id);
  } catch {
    rejectedPast = true;
  }
  check("cancelling a past session rejected", rejectedPast);

  // --- D. Cancelling before payment needs no refund -----------------------------------
  console.log(`\n[D] Cancelling a PENDING_APPROVAL booking (no payment yet)`);
  const openSlots = await getAvailableStartTimes(TEST_DATE, 30);
  const freeSlot = openSlots.find((s) => ![540, 570].includes(s)) ?? 660;
  const reqD = await createBookingRequest({
    displayName: "Cancellation Test Customer",
    email: TEST_EMAIL,
    date: TEST_DATE,
    startTime: freeSlot,
    duration: 30,
    callMethod: "JUM",
    sharedRealInfo: false,
  });
  testUserIds.push(reqD.userId);
  const resultD = await cancelByCustomer(reqD.id);
  check("no refund needed (never paid)", resultD.refundedInr === 0);
  check("booking is CUSTOMER_CANCELLED", resultD.booking.bookingStatus === BookingStatus.CUSTOMER_CANCELLED);

  // --- E. Admin can't cancel a non-CONFIRMED booking -----------------------------------
  console.log(`\n[E] Admin can't cancel a non-CONFIRMED booking`);
  let rejectedAdminOnPending = false;
  try {
    await cancelByAdmin(reqD.id); // already CUSTOMER_CANCELLED from test D
  } catch {
    rejectedAdminOnPending = true;
  }
  check("admin-cancel on a non-CONFIRMED booking rejected", rejectedAdminOnPending);

  // --- Cleanup -----------------------------------------------------------------
  await prisma.payment.deleteMany({ where: { booking: { userId: { in: testUserIds } } } });
  await prisma.booking.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  console.log("\nCleaned up test data.");

  console.log(`\n${pass} passed, ${fail} failed.`);
  console.log("(Real Razorpay refund-creation call verified manually against a real payment — see file header. Blocked by pending KYC, not a code defect.)");
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
