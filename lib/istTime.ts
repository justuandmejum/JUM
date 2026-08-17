// Shared IST wall-clock <-> real UTC instant helpers. IST is a fixed
// UTC+5:30 offset (no DST), the same trick used throughout
// lib/availability.ts and lib/i18n/bookingFormat.ts.
const IST_OFFSET_MS = 330 * 60_000;

/** The real UTC instant for a stored (date, minutesSinceMidnight) pair —
 * `date` is a UTC-midnight stand-in for the IST calendar date (see
 * lib/availability.ts), so the actual instant is that shifted back by
 * the IST offset. */
export function istWallClockToUtc(date: Date, minutesSinceMidnight: number): Date {
  return new Date(date.getTime() + minutesSinceMidnight * 60_000 - IST_OFFSET_MS);
}

export function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
