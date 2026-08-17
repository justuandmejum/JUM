// Seeds the default recurring open hours: every day of the week, 9:00 AM to
// 10:00 PM IST — matching the prototype's hardcoded calendar so real
// behavior doesn't regress on launch. Adjust later via the admin dashboard
// (Phase 7) once the actual host's real hours are known.
// Run with: npx tsx -r dotenv/config scripts/seed-availability.ts
import { prisma } from "../lib/prisma";
import { AvailabilityType } from "../app/generated/prisma/enums";

const OPEN_START = 9 * 60; // 09:00
const OPEN_END = 22 * 60; // 22:00

async function main() {
  const existing = await prisma.availabilityRule.count({
    where: { type: AvailabilityType.RECURRING_OPEN },
  });
  if (existing > 0) {
    console.log(`${existing} RECURRING_OPEN rule(s) already exist — skipping seed. Delete them first to reseed.`);
    return;
  }

  const rules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    type: AvailabilityType.RECURRING_OPEN,
    dayOfWeek,
    startMinutes: OPEN_START,
    endMinutes: OPEN_END,
  }));

  await prisma.availabilityRule.createMany({ data: rules });
  console.log(`Seeded ${rules.length} RECURRING_OPEN rules (09:00-22:00, every day).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
