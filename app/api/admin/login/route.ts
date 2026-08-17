import type { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { verifyPassword, createSessionToken, buildSessionCookieHeader } from "../../../../lib/admin-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, password } = body;
  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "'email' and 'password' are required." }, { status: 400 });
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  // Always run a real scrypt computation, even with no matching admin, so a
  // bad email takes about as long as a bad password — avoids a timing
  // side-channel that would leak which emails have accounts.
  const valid = await verifyPassword(password, admin?.passwordHash ?? "0".repeat(32) + ":" + "0".repeat(128));
  if (!admin || !valid) {
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

  const token = createSessionToken({ adminId: admin.id, email: admin.email, role: admin.role });
  return Response.json(
    { admin: { email: admin.email, role: admin.role } },
    { headers: { "Set-Cookie": buildSessionCookieHeader(token) } }
  );
}
