// Date/time formatting helpers for the booking flow, ported from the
// prototype's getIST()/genTimeSlots()/buildCalendar() so the real app's
// calendar and time labels look identical in both languages.
import type { Lang } from "./LanguageProvider";

// IST is a fixed UTC+5:30 offset (no DST) — shift the epoch and read UTC
// parts, so this is correct regardless of the visitor's own timezone.
export function getIstNow(): { year: number; month: number; date: number; hours: number; minutes: number } {
  const d = new Date(Date.now() + 330 * 60000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
}

export interface CalendarDay {
  /** YYYY-MM-DD, IST calendar date — what the API expects. */
  dateStr: string;
  /** UTC-midnight Date matching dateStr, for locale formatting. */
  date: Date;
  isToday: boolean;
}

/** The next 14 days starting today (IST), matching the prototype's rolling window. */
export function buildFourteenDays(): CalendarDay[] {
  const ist = getIstNow();
  const base = new Date(Date.UTC(ist.year, ist.month, ist.date));
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    return { dateStr, date: d, isToday: i === 0 };
  });
}

function localeFor(lang: Lang): string | undefined {
  return lang === "te" ? "te-IN" : undefined;
}

export function formatDayLabel(date: Date, lang: Lang): { weekday: string; day: number; month: string } {
  const locale = localeFor(lang);
  const opts = (o: Intl.DateTimeFormatOptions) => ({ ...o, timeZone: "UTC" });
  return {
    weekday: date.toLocaleDateString(locale, opts({ weekday: "short" })),
    day: date.getUTCDate(),
    month: date.toLocaleDateString(locale, opts({ month: "short" })),
  };
}

export function formatFullDateLabel(date: Date, lang: Lang): string {
  const locale = localeFor(lang);
  return date.toLocaleDateString(locale, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

const TELUGU_PERIOD = (h: number): string => (h < 12 ? "ఉదయం" : h < 16 ? "మధ్యాహ్నం" : h < 19 ? "సాయంత్రం" : "రాత్రి");

/** Formats minutes-since-midnight as a display time, matching the
 * prototype's genTimeSlots() exactly (12-hour EN, period-word TE). */
export function formatTimeOfDay(totalMin: number, lang: Lang): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m === 0 ? "00" : String(m).padStart(2, "0");
  if (lang === "te") return `${TELUGU_PERIOD(h)} ${h12}:${mm}`;
  const ap = h < 12 ? "AM" : "PM";
  return `${h12 < 10 ? "0" + h12 : h12}:${mm} ${ap}`;
}
