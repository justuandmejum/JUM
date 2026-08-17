// One-off verification script for the availability engine — not part of
// the app. Run with: npx tsx -r dotenv/config scripts/test-availability.ts
import { prisma } from "../lib/prisma";
import { getAvailableStartTimes } from "../lib/availability";
import { AvailabilityType, BookingStatus } from "../app/generated/prisma/enums";

const TEST_DATE = "2026-09-15"; // a Tuesday, far enough out to not collide with real bookings
const TEST_DATE_OBJ = new Date("2026-09-15");

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
  // --- 1. Plain open day (recurring 09:00-22:00, no bookings) ---------------
  console.log(`\n[1] Plain open day, 30-min duration`);
  const plain = await getAvailableStartTimes(TEST_DATE, 30);
  check("first slot is 09:00 (540)", plain[0] === 540);
  check("last slot is 21:30 (1290), not 22:00", plain[plain.length - 1] === 1290);
  check("26 half-hour slots available", plain.length === 26);

  // --- 2. Existing booking blocks overlapping start times --------------------
  console.log(`\n[2] Booking at 10:00-10:30 blocks overlapping starts`);
  const user = await prisma.user.create({
    data: { displayName: "Availability Test User", email: `avail-test-${Date.now()}@example.com` },
  });
  const booking = await prisma.booking.create({
    data: {
      userId: user.id,
      date: TEST_DATE_OBJ,
      startTime: 600,
      endTime: 630,
      duration: 30,
      callMethod: "JUM",
      amountInr: 199,
      callCode: `JUM-AVAILTEST${Date.now()}`,
      bookingStatus: BookingStatus.CONFIRMED,
    },
  });
  const withBooking30 = await getAvailableStartTimes(TEST_DATE, 30);
  check("10:00 (600) no longer available for 30-min", !withBooking30.includes(600));
  check("09:30 (570) still available for 30-min (doesn't overlap)", withBooking30.includes(570));
  check("10:30 (630) still available for 30-min (starts exactly when booking ends)", withBooking30.includes(630));

  const withBooking60 = await getAvailableStartTimes(TEST_DATE, 60);
  check("09:30 (570) blocked for 60-min (would run into the booking)", !withBooking60.includes(570));
  check("10:30 (630) still available for 60-min", withBooking60.includes(630));

  // --- 3. Full-day BLOCKED rule clears the day --------------------------------
  console.log(`\n[3] Full-day BLOCKED rule`);
  const blockRule = await prisma.availabilityRule.create({
    data: { type: AvailabilityType.BLOCKED, date: TEST_DATE_OBJ, reason: "test full-day block" },
  });
  const blockedDay = await getAvailableStartTimes(TEST_DATE, 30);
  check("no slots available on a fully blocked day", blockedDay.length === 0);
  await prisma.availabilityRule.delete({ where: { id: blockRule.id } });

  // --- 4. Partial BLOCKED window (lunch break) --------------------------------
  console.log(`\n[4] Partial BLOCKED window (13:00-14:00)`);
  const lunchRule = await prisma.availabilityRule.create({
    data: { type: AvailabilityType.BLOCKED, date: TEST_DATE_OBJ, startMinutes: 780, endMinutes: 840, reason: "lunch" },
  });
  const withLunch = await getAvailableStartTimes(TEST_DATE, 30);
  check("12:30 (750) still available", withLunch.includes(750));
  check("13:00 (780) blocked", !withLunch.includes(780));
  check("13:30 (810) blocked", !withLunch.includes(810));
  check("14:00 (840) available again", withLunch.includes(840));
  await prisma.availabilityRule.delete({ where: { id: lunchRule.id } });

  // --- 5. Today: past times excluded ------------------------------------------
  console.log(`\n[5] Today's date excludes past start times`);
  const now = new Date(Date.now() + 330 * 60000); // IST shift, same trick as lib/availability.ts
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const todaySlots = await getAvailableStartTimes(todayStr, 30);
  check("all returned start times are in the future", todaySlots.every((t) => t > nowMinutes));

  // --- Cleanup -----------------------------------------------------------------
  await prisma.booking.delete({ where: { id: booking.id } });
  await prisma.user.delete({ where: { id: user.id } });
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
