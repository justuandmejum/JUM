"use client";

import { useEffect, useState } from "react";

export interface BookingStatusInfo {
  id: string;
  bookingStatus: string;
  date: string;
  startTime: number;
  endTime: number;
  duration: number;
  callMethod: string;
  amountInr: number;
  holdExpiresAt: string | null;
  callCode: string | null;
}

/** Polls GET /api/bookings/:id on an interval — the only way to notice a
 * status change until Phase 5 adds real-time notifications. */
export function useBookingStatus(bookingId: string, intervalMs = 4000) {
  const [booking, setBooking] = useState<BookingStatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Booking not found.");
          return;
        }
        setBooking(data.booking);
      } catch {
        if (!cancelled) setError("Network error.");
      }
    }
    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bookingId, intervalMs]);

  return { booking, error };
}
