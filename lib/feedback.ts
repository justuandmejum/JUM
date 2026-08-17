// Post-call feedback — a simple 1-5 star rating plus an optional comment,
// matching the prototype's #feedback page. Once per booking, and only
// after the call has actually finished (Booking.bookingStatus COMPLETED,
// which lib/calling.ts's endSession() is the only path that sets).

import { prisma } from "./prisma";
import { BookingError, InvalidBookingStateError } from "./bookings";
import { BookingStatus } from "../app/generated/prisma/enums";
import type { Feedback } from "../app/generated/prisma/client";

export async function submitFeedback(bookingId: string, rating: number, comment?: string): Promise<Feedback> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new BookingError("Rating must be a whole number from 1 to 5.");
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new BookingError(`Booking ${bookingId} not found.`);
  if (booking.bookingStatus !== BookingStatus.COMPLETED) {
    throw new InvalidBookingStateError(`Booking ${bookingId} is ${booking.bookingStatus}, not COMPLETED — feedback can only be given once the session has ended.`);
  }

  const existing = await prisma.feedback.findUnique({ where: { bookingId } });
  if (existing) throw new InvalidBookingStateError(`Feedback for booking ${bookingId} was already submitted.`);

  const trimmed = comment?.trim();
  return prisma.feedback.create({
    data: { bookingId, rating, comment: trimmed ? trimmed : undefined },
  });
}
