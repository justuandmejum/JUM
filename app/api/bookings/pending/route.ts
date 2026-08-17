import type { NextRequest } from "next/server";
import { checkAdminAuth } from "../../../../lib/admin-auth";
import { listPendingApprovals } from "../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Stand-in for real-time notifications (Phase 5) — poll this to see
// requests waiting on JUM's accept/decline within their response window.
export async function GET(request: NextRequest) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const bookings = await listPendingApprovals();
  return Response.json({ bookings });
}
