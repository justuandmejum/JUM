// The real availability engine — replaces the prototype's hardcoded
// 9am-10pm calendar with rules-driven open hours from AvailabilityRule,
// minus whatever's already booked.
//
// Times are IST wall-clock minutes since midnight (0-1439), matching the
// prototype's TIME_MINUTES convention and Booking.startTime/endTime.

import { prisma } from "./prisma";
import { AvailabilityType, BookingStatus } from "../app/generated/prisma/enums";

export const SLOT_STEP_MINUTES = 30;

export interface Window {
  start: number; // minutes since midnight
  end: number;
}

function parseDateOnly(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) throw new Error(`Invalid date "${dateStr}", expected YYYY-MM-DD`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// IST is a fixed UTC+5:30 offset (no DST) — shift the epoch and read UTC
// parts, same trick the prototype's getIST() uses.
function getIstNow(): { date: Date; minutes: number } {
  const shifted = new Date(Date.now() + 330 * 60000);
  const date = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return { date, minutes };
}

function subtractWindow(windows: Window[], block: Window): Window[] {
  const result: Window[] = [];
  for (const w of windows) {
    if (block.end <= w.start || block.start >= w.end) {
      result.push(w);
      continue;
    }
    if (block.start > w.start) result.push({ start: w.start, end: Math.min(block.start, w.end) });
    if (block.end < w.end) result.push({ start: Math.max(block.end, w.start), end: w.end });
  }
  return result;
}

function overlaps(a: Window, b: Window): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Open windows (minutes since midnight) for a given date, after applying:
 *  - RECURRING_OPEN rules for that day of week (the default schedule)
 *  - DATE_OPEN rules for that exact date, which fully override the
 *    recurring schedule when present (e.g. a one-off extended day)
 *  - BLOCKED / HOLIDAY rules, subtracted from whatever's open (a full-day
 *    entry, i.e. startMinutes/endMinutes both null, clears the whole day)
 */
export async function getOpenWindows(dateStr: string): Promise<Window[]> {
  const date = parseDateOnly(dateStr);
  const dayOfWeek = date.getUTCDay();

  const rules = await prisma.availabilityRule.findMany({
    where: {
      OR: [
        { type: AvailabilityType.RECURRING_OPEN, dayOfWeek },
        { type: { in: [AvailabilityType.DATE_OPEN, AvailabilityType.BLOCKED, AvailabilityType.HOLIDAY] }, date },
      ],
    },
  });

  const dateOpen = rules.filter((r) => r.type === AvailabilityType.DATE_OPEN);
  const recurring = rules.filter((r) => r.type === AvailabilityType.RECURRING_OPEN);
  const blocks = rules.filter((r) => r.type === AvailabilityType.BLOCKED || r.type === AvailabilityType.HOLIDAY);

  const base = dateOpen.length > 0 ? dateOpen : recurring;
  let windows: Window[] = base
    .filter((r) => r.startMinutes !== null && r.endMinutes !== null)
    .map((r) => ({ start: r.startMinutes!, end: r.endMinutes! }));

  for (const b of blocks) {
    if (b.startMinutes === null || b.endMinutes === null) {
      windows = [];
      break;
    }
    windows = subtractWindow(windows, { start: b.startMinutes, end: b.endMinutes });
  }

  return windows.sort((a, b) => a.start - b.start);
}

// Bookings in these statuses occupy their slot unconditionally.
// PENDING_APPROVAL and TEMPORARILY_HELD also occupy it, but only while
// their response/payment window (holdExpiresAt) hasn't expired — the
// expiry sweep (lib/bookings.ts expireStaleHolds) flips stale ones to
// BOOKING_FAILED, but until that runs we treat an expired window as free
// rather than trusting the status alone.
const BLOCKING_STATUSES: BookingStatus[] = [
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
];

const TIMED_BLOCKING_STATUSES: BookingStatus[] = [BookingStatus.PENDING_APPROVAL, BookingStatus.TEMPORARILY_HELD];

/** Ranges (minutes since midnight) already occupied by bookings on this date. */
export async function getBookedRanges(dateStr: string): Promise<Window[]> {
  const date = parseDateOnly(dateStr);
  const bookings = await prisma.booking.findMany({
    where: {
      date,
      OR: [
        { bookingStatus: { in: BLOCKING_STATUSES } },
        { bookingStatus: { in: TIMED_BLOCKING_STATUSES }, holdExpiresAt: { gt: new Date() } },
      ],
    },
    select: { startTime: true, endTime: true },
  });
  return bookings.map((b) => ({ start: b.startTime, end: b.endTime }));
}

/**
 * All 30-minute-aligned start times on `dateStr` where a booking of
 * `durationMinutes` fits entirely inside an open window and doesn't
 * overlap any existing booking. Excludes times already in the past when
 * `dateStr` is today (IST).
 */
export async function getAvailableStartTimes(dateStr: string, durationMinutes: number): Promise<number[]> {
  if (durationMinutes <= 0 || durationMinutes % SLOT_STEP_MINUTES !== 0) {
    throw new Error(`durationMinutes must be a positive multiple of ${SLOT_STEP_MINUTES}`);
  }

  const [openWindows, booked] = await Promise.all([getOpenWindows(dateStr), getBookedRanges(dateStr)]);

  const targetDate = parseDateOnly(dateStr);
  const istNow = getIstNow();
  const isToday = targetDate.getTime() === istNow.date.getTime();

  const starts: number[] = [];
  for (const w of openWindows) {
    for (let t = w.start; t + durationMinutes <= w.end; t += SLOT_STEP_MINUTES) {
      if (isToday && t <= istNow.minutes) continue;
      const candidate: Window = { start: t, end: t + durationMinutes };
      if (booked.some((b) => overlaps(candidate, b))) continue;
      starts.push(t);
    }
  }
  return starts;
}
