import type { NextRequest } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { expireStaleHolds } from "../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Meant to run on a schedule (Azure Function timer trigger, once deployed).
// Until then, call this by hand or point a cron at it.
export async function POST(request: NextRequest) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const count = await expireStaleHolds();
  return Response.json({ expiredCount: count });
}
