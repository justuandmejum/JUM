import type { NextRequest } from "next/server";
import { checkAdminAuth } from "../../../../../lib/admin-auth";
import { prisma } from "../../../../../lib/prisma";
import { AvailabilityType } from "../../../../../app/generated/prisma/enums";
import { SLOT_STEP_MINUTES } from "../../../../../lib/availability";

export const dynamic = "force-dynamic";

interface DayInput {
  dayOfWeek: number; // 0=Sunday..6=Saturday
  closed: boolean;
  startMinutes?: number;
  endMinutes?: number;
}

function isValidDay(d: unknown): d is DayInput {
  if (typeof d !== "object" || d === null) return false;
  const day = d as Record<string, unknown>;
  if (typeof day.dayOfWeek !== "number" || day.dayOfWeek < 0 || day.dayOfWeek > 6) return false;
  if (typeof day.closed !== "boolean") return false;
  if (day.closed) return true;
  const isValidMinutes = (m: unknown) => typeof m === "number" && Number.isInteger(m) && m >= 0 && m <= 1440 && m % SLOT_STEP_MINUTES === 0;
  if (!isValidMinutes(day.startMinutes) || !isValidMinutes(day.endMinutes)) return false;
  return (day.startMinutes as number) < (day.endMinutes as number);
}

// Replaces the entire weekly recurring schedule atomically — the admin UI
// always sends all 7 days, closed or not, so a full replace is simpler
// and safer than trying to diff against the existing rows.
export async function PUT(request: NextRequest) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const days = (body as { days?: unknown[] })?.days;
  if (!Array.isArray(days) || days.length !== 7 || !days.every(isValidDay)) {
    return Response.json({ error: "'days' must be an array of all 7 days (dayOfWeek 0-6), each either closed or with valid startMinutes/endMinutes (multiples of 30, start < end)." }, { status: 400 });
  }

  const validDays = days as DayInput[];
  const seen = new Set(validDays.map((d) => d.dayOfWeek));
  if (seen.size !== 7) {
    return Response.json({ error: "'days' must include each dayOfWeek (0-6) exactly once." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({ where: { type: AvailabilityType.RECURRING_OPEN } }),
    prisma.availabilityRule.createMany({
      data: validDays
        .filter((d) => !d.closed)
        .map((d) => ({
          type: AvailabilityType.RECURRING_OPEN,
          dayOfWeek: d.dayOfWeek,
          startMinutes: d.startMinutes,
          endMinutes: d.endMinutes,
        })),
    }),
  ]);

  const weeklyHours = await prisma.availabilityRule.findMany({
    where: { type: AvailabilityType.RECURRING_OPEN },
    orderBy: { dayOfWeek: "asc" },
  });
  return Response.json({ weeklyHours });
}
