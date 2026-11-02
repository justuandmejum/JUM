import type { NextRequest } from "next/server";
import { checkAdminAuthAndCsrf } from "../../../../lib/admin-auth";
import { expireStaleHolds } from "../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Runs every 5 minutes from .github/workflows/expire-stale-holds.yml.
// Can also be called by hand with the x-admin-key header.
export async function POST(request: NextRequest) {
  const authError = checkAdminAuthAndCsrf(request);
  if (authError) return authError;

  const count = await expireStaleHolds();
  return Response.json({ expiredCount: count });
}
