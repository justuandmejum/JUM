// Gate for admin-only endpoints. Accepts either:
//  - a valid dashboard session cookie (real admin login, Phase 7), or
//  - the `x-admin-key` shared secret (for scripts and the future Azure
//    Function timer trigger that calls expire-stale — those aren't a
//    logged-in browser, so they don't have a session cookie to send).
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./admin-session";

export function checkAdminAuth(request: NextRequest): Response | null {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (session) return null;

  const expected = process.env.ADMIN_API_KEY;
  if (expected && request.headers.get("x-admin-key") === expected) return null;

  return Response.json({ error: "Unauthorized." }, { status: 401 });
}
