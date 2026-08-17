import type { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { BookingStatus } from "../../../../app/generated/prisma/enums";

export const dynamic = "force-dynamic";

// Public: lets the customer's own browser poll their booking's status
// (waiting-for-approval / payment / confirmed) without exposing anything
// beyond what their own browser already submitted. There's no real-time
// notification system yet (Phase 5), so polling is the only option.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      bookingStatus: true,
      date: true,
      startTime: true,
      endTime: true,
      duration: true,
      callMethod: true,
      amountInr: true,
      holdExpiresAt: true,
      callCode: true,
    },
  });

  if (!booking) {
    return Response.json({ error: "Booking not found." }, { status: 404 });
  }

  return Response.json({
    booking: {
      ...booking,
      // The session code is only meaningful (and only shown) once paid.
      callCode: booking.bookingStatus === BookingStatus.CONFIRMED ? booking.callCode : null,
    },
  });
}
