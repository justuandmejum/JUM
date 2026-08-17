import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../../../../lib/admin-session";

export const dynamic = "force-dynamic";

// Lets the dashboard check "am I logged in?" on load without re-sending credentials.
export async function GET(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return Response.json({ error: "Not logged in." }, { status: 401 });
  return Response.json({ admin: { email: session.email, role: session.role }, csrfToken: session.csrfToken });
}
