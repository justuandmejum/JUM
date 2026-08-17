// One-off verification script for the booking system — not part of the
// app. Run with: npx tsx -r dotenv/config scripts/test-bookings.ts
import { prisma } from "../lib/prisma";
import { getAvailableStartTimes } from "../lib/availability";
import {
  createBookingRequest,
  approveBooking,
  declineBooking,
  confirmBooking,
  expireStaleHolds,
  listPendingApprovals,
  BookingError,
  SlotUnavailableError,
} from "../lib/bookings";
import { BookingStatus } from "../app/generated/prisma/enums";

const TEST_DATE = "2026-09-16"; // a Wednesday, far enough out to not collide with real bookings
const TEST_EMAIL = `booking-test-${Date.now()}@example.com`;

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

async function main() {
  const testUserIds: string[] = [];

  // --- 1. Create a request ----------------------------------------------------
  console.log(`\n[1] Create a booking request (PENDING_APPROVAL)`);
  const req1 = await createBookingRequest({
    displayName: "Test Customer",
    email: TEST_EMAIL,
    date: TEST_DATE,
    startTime: 660, // 11:00
    duration: 30,
    callMethod: "JUM",
    sharedRealInfo: false,
  });
  testUserIds.push(req1.userId);
  check("status is PENDING_APPROVAL", req1.bookingStatus === BookingStatus.PENDING_APPROVAL);
  check("amount matches 30-min pricing (199)", req1.amountInr === 199);
  check("callCode looks like JUM-XXXXXX", /^JUM-[A-Z0-9]{6}$/.test(req1.callCode));
  check(
    "holdExpiresAt is ~15 minutes out",
    Math.abs(req1.holdExpiresAt!.getTime() - (Date.now() + 15 * 60 * 1000)) < 5000
  );

  // --- 2. Pending request blocks the slot -------------------------------------
  console.log(`\n[2] Pending request blocks the slot`);
  const openWithPending = await getAvailableStartTimes(TEST_DATE, 30);
  check("11:00 (660) no longer available while pending", !openWithPending.includes(660));

  // --- 3. A second request for the same slot is rejected ----------------------
  console.log(`\n[3] Same slot rejected for a second request`);
  let rejected = false;
  try {
    await createBookingRequest({
      displayName: "Other Customer",
      email: `booking-test-2-${Date.now()}@example.com`,
      date: TEST_DATE,
      startTime: 660,
      duration: 30,
      callMethod: "JUM",
      sharedRealInfo: false,
    });
  } catch (err) {
    rejected = err instanceof SlotUnavailableError;
  }
  check("second request for the same slot was rejected", rejected);

  // --- 4. Appears in the pending-approvals list --------------------------------
  console.log(`\n[4] Appears in listPendingApprovals()`);
  const pendingList = await listPendingApprovals();
  check("request 1 is in the pending list", pendingList.some((b) => b.id === req1.id));

  // --- 5. Approve -> TEMPORARILY_HELD ------------------------------------------
  console.log(`\n[5] Approve moves PENDING_APPROVAL -> TEMPORARILY_HELD`);
  const approved = await approveBooking(req1.id);
  check("status is TEMPORARILY_HELD", approved.bookingStatus === BookingStatus.TEMPORARILY_HELD);
  check(
    "holdExpiresAt reset to ~5 minutes out",
    Math.abs(approved.holdExpiresAt!.getTime() - (Date.now() + 5 * 60 * 1000)) < 5000
  );
  const stillBlocked = await getAvailableStartTimes(TEST_DATE, 30);
  check("11:00 (660) still blocked after approval", !stillBlocked.includes(660));

  // --- 6. Confirm -> CONFIRMED ---------------------------------------------------
  console.log(`\n[6] Confirm moves TEMPORARILY_HELD -> CONFIRMED`);
  const confirmed = await confirmBooking(req1.id);
  check("status is CONFIRMED", confirmed.bookingStatus === BookingStatus.CONFIRMED);
  check("paymentStatus is SUCCESSFUL", confirmed.paymentStatus === "SUCCESSFUL");
  const blockedAfterConfirm = await getAvailableStartTimes(TEST_DATE, 30);
  check("11:00 (660) still blocked after confirmation", !blockedAfterConfirm.includes(660));

  // --- 7. Decline frees the slot --------------------------------------------------
  console.log(`\n[7] Decline frees the slot`);
  const req2 = await createBookingRequest({
    displayName: "Test Customer",
    email: TEST_EMAIL,
    date: TEST_DATE,
    startTime: 720, // 12:00
    duration: 30,
    callMethod: "ZOOM",
    sharedRealInfo: true,
  });
  const beforeDecline = await getAvailableStartTimes(TEST_DATE, 30);
  check("12:00 (720) blocked before decline", !beforeDecline.includes(720));
  const declined = await declineBooking(req2.id);
  check("status is BOOKING_FAILED", declined.bookingStatus === BookingStatus.BOOKING_FAILED);
  const afterDecline = await getAvailableStartTimes(TEST_DATE, 30);
  check("12:00 (720) available again after decline", afterDecline.includes(720));

  // --- 8. Expiry sweep flips stale holds and frees the slot -----------------------
  console.log(`\n[8] Expiry sweep`);
  const req3 = await createBookingRequest({
    displayName: "Test Customer",
    email: TEST_EMAIL,
    date: TEST_DATE,
    startTime: 780, // 13:00
    duration: 30,
    callMethod: "JUM",
    sharedRealInfo: false,
  });
  await prisma.booking.update({ where: { id: req3.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
  const expiredCount = await expireStaleHolds();
  check("expireStaleHolds() swept at least our stale request", expiredCount >= 1);
  const afterSweepStatus = await prisma.booking.findUnique({ where: { id: req3.id } });
  check("swept request is now BOOKING_FAILED", afterSweepStatus?.bookingStatus === BookingStatus.BOOKING_FAILED);
  const afterSweep = await getAvailableStartTimes(TEST_DATE, 30);
  check("13:00 (780) available again after sweep", afterSweep.includes(780));

  // --- 9. Invalid duration is rejected ---------------------------------------------
  console.log(`\n[9] Invalid duration rejected`);
  let invalidRejected = false;
  try {
    await createBookingRequest({
      displayName: "Test Customer",
      email: TEST_EMAIL,
      date: TEST_DATE,
      startTime: 840,
      duration: 45,
      callMethod: "JUM",
      sharedRealInfo: false,
    });
  } catch (err) {
    invalidRejected = err instanceof BookingError;
  }
  check("45-minute duration was rejected", invalidRejected);

  // --- Cleanup -----------------------------------------------------------------
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
