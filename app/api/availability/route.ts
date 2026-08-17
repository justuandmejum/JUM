import type { NextRequest } from "next/server";
import { getAvailableStartTimes, SLOT_STEP_MINUTES } from "../../../lib/availability";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get("date");
  const durationParam = searchParams.get("duration");

  if (!date || !DATE_RE.test(date)) {
    return Response.json({ error: "Query param 'date' is required, format YYYY-MM-DD." }, { status: 400 });
  }

  const duration = durationParam ? Number(durationParam) : SLOT_STEP_MINUTES;
  if (!Number.isInteger(duration) || duration <= 0 || duration % SLOT_STEP_MINUTES !== 0) {
    return Response.json(
      { error: `Query param 'duration' must be a positive multiple of ${SLOT_STEP_MINUTES}.` },
      { status: 400 }
    );
  }

  try {
    const availableStartTimes = await getAvailableStartTimes(date, duration);
    return Response.json({ date, duration, availableStartTimes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}
