import type { NextRequest } from "next/server";
import { checkAdminAuth } from "../../../../../lib/admin-auth";
import { prisma } from "../../../../../lib/prisma";
import { BookingStatus } from "../../../../../app/generated/prisma/enums";

export const dynamic = "force-dynamic";

// Read-only visibility into what's actually on the calendar — separate
// from the pending-approval queue, which is the actionable list.
export async function GET(request: NextRequest) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const bookings = await prisma.booking.findMany({
    where: { bookingStatus: BookingStatus.CONFIRMED, date: { gte: today } },
    include: { user: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 50,
  });

  return Response.json({ bookings });
}
