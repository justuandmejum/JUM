// Gate for admin-only endpoints. Accepts either:
//  - a valid dashboard session cookie (real admin login, Phase 7), or
//  - the `x-admin-key` shared secret (for scripts and the future Azure
//    Function timer trigger that calls expire-stale — those aren't a
//    logged-in browser, so they don't have a session cookie to send).
import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./admin-session";

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function checkAdminAuth(request: NextRequest): Response | null {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (session) return null;

  const expected = process.env.ADMIN_API_KEY;
  const provided = request.headers.get("x-admin-key");
  if (expected && provided && timingSafeStringEqual(provided, expected)) return null;

  return Response.json({ error: "Unauthorized." }, { status: 401 });
}

/** Same as checkAdminAuth, but for state-changing routes: when authenticated
 * via the session cookie, also requires a matching `x-csrf-token` header —
 * SameSite=Lax already blocks most cross-site POSTs in modern browsers, but
 * this is real defense-in-depth rather than relying on that alone. Not
 * required on the x-admin-key path, since that's not a browser/cookie flow
 * and isn't exposed to CSRF the same way. */
export function checkAdminAuthAndCsrf(request: NextRequest): Response | null {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (session) {
    const provided = request.headers.get("x-csrf-token");
    if (!provided || !timingSafeStringEqual(provided, session.csrfToken)) {
      return Response.json({ error: "Missing or invalid CSRF token." }, { status: 403 });
    }
    return null;
  }

  const expected = process.env.ADMIN_API_KEY;
  const provided = request.headers.get("x-admin-key");
  if (expected && provided && timingSafeStringEqual(provided, expected)) return null;

  return Response.json({ error: "Unauthorized." }, { status: 401 });
}
