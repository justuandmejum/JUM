// Shared-secret gate for admin-only endpoints — a stand-in until Phase 7
// builds real admin login/sessions. Checks the `x-admin-key` header
// against ADMIN_API_KEY.
import type { NextRequest } from "next/server";

export function checkAdminAuth(request: NextRequest): Response | null {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return Response.json({ error: "Server misconfigured: ADMIN_API_KEY is not set." }, { status: 500 });
  }
  const provided = request.headers.get("x-admin-key");
  if (provided !== expected) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
