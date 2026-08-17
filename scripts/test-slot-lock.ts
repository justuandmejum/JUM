// One-off verification script for the partial unique index — not part of
// the app. Run with: npx tsx scripts/test-slot-lock.ts
import { prisma } from "../lib/prisma";

async function main() {
  const testEmail = `slot-lock-test-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: { displayName: "Test User", email: testEmail },
  });

  const bookingData = {
    userId: user.id,
    date: new Date("2026-09-01"),
    startTime: 600, // 10:00
    endTime: 630,
    duration: 30,
    callMethod: "JUM" as const,
    amountInr: 199,
    callCode: `JUM-TEST${Date.now()}`,
  };

  const first = await prisma.booking.create({ data: bookingData });
  console.log("First booking created:", first.id, "status:", first.bookingStatus);

  try {
    await prisma.booking.create({
      data: { ...bookingData, callCode: `JUM-TEST${Date.now()}B` },
    });
    console.log("PROBLEM: second booking for the same slot was allowed to be created.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint failed") && message.includes("startTime")) {
      console.log("CORRECT: second booking for the same slot was rejected by the database.");
    } else {
      console.log("Rejected, but not by the expected constraint:\n", message);
    }
  }

  // Cleanup
  await prisma.booking.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log("Cleaned up test data.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
