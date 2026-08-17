import type { NextRequest } from "next/server";
import { checkAdminAuth } from "../../../../../lib/admin-auth";
import { prisma } from "../../../../../lib/prisma";
import { AvailabilityType } from "../../../../../app/generated/prisma/enums";
import { SLOT_STEP_MINUTES } from "../../../../../lib/availability";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { date, startMinutes, endMinutes, reason, type } = body;

  if (typeof date !== "string" || !DATE_RE.test(date)) {
    return Response.json({ error: "'date' is required, format YYYY-MM-DD." }, { status: 400 });
  }
  if (type !== "BLOCKED" && type !== "HOLIDAY") {
    return Response.json({ error: "'type' must be 'BLOCKED' or 'HOLIDAY'." }, { status: 400 });
  }

  // Either a full-day block (both omitted) or a specific time window (both required, valid).
  const isFullDay = startMinutes === undefined && endMinutes === undefined;
  const isValidMinutes = (m: unknown) => typeof m === "number" && Number.isInteger(m) && m >= 0 && m <= 1440 && m % SLOT_STEP_MINUTES === 0;
  if (!isFullDay) {
    if (!isValidMinutes(startMinutes) || !isValidMinutes(endMinutes) || (startMinutes as number) >= (endMinutes as number)) {
      return Response.json({ error: "'startMinutes'/'endMinutes' must both be valid (multiples of 30, start < end), or both omitted for a full-day block." }, { status: 400 });
    }
  }

  const [year, month, day] = date.split("-").map(Number);
  const rule = await prisma.availabilityRule.create({
    data: {
      type: type === "HOLIDAY" ? AvailabilityType.HOLIDAY : AvailabilityType.BLOCKED,
      date: new Date(Date.UTC(year, month - 1, day)),
      startMinutes: isFullDay ? null : (startMinutes as number),
      endMinutes: isFullDay ? null : (endMinutes as number),
      reason: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : null,
    },
  });

  return Response.json({ block: rule }, { status: 201 });
}
