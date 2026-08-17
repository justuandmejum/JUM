import type { NextRequest } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";
import { AvailabilityType } from "../../../../app/generated/prisma/enums";

export const dynamic = "force-dynamic";

// Schedule management for the admin dashboard — replaces the seed-script/
// direct-DB-only editing noted since Phase 2.
// IST is a fixed UTC+5:30 offset — same trick used throughout lib/availability.ts.
function todayIstUtcMidnight(): Date {
  const shifted = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

export async function GET(request: NextRequest) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const [weeklyHours, blocks] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: { type: AvailabilityType.RECURRING_OPEN },
      orderBy: { dayOfWeek: "asc" },
    }),
    prisma.availabilityRule.findMany({
      where: { type: { in: [AvailabilityType.BLOCKED, AvailabilityType.HOLIDAY] }, date: { gte: todayIstUtcMidnight() } },
      orderBy: { date: "asc" },
    }),
  ]);

  return Response.json({ weeklyHours, blocks });
}
