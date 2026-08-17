import type { NextRequest } from "next/server";
import { checkAdminAuthAndCsrf } from "../../../../../../lib/admin-auth";
import { prisma } from "../../../../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = checkAdminAuthAndCsrf(request);
  if (authError) return authError;

  const { id } = await params;
  try {
    await prisma.availabilityRule.delete({ where: { id } });
  } catch {
    return Response.json({ error: "Block not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
