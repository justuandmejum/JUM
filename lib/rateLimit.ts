// DB-backed sliding-window rate limiting — see prisma/schema.prisma's
// RateLimitHit comment for why this isn't in-memory.
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";

export interface RateLimitOptions {
  maxAttempts: number;
  windowMs: number;
}

/** Returns true if the request is allowed (and records this attempt),
 * false if the key has hit its limit within the window. Opportunistically
 * clears its own old rows on each check, so the table doesn't grow
 * unbounded without needing a separate cleanup job. */
export async function checkRateLimit(key: string, { maxAttempts, windowMs }: RateLimitOptions): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs);

  await prisma.rateLimitHit.deleteMany({ where: { key, createdAt: { lt: windowStart } } });
  const count = await prisma.rateLimitHit.count({ where: { key, createdAt: { gte: windowStart } } });
  if (count >= maxAttempts) return false;

  await prisma.rateLimitHit.create({ data: { key } });
  return true;
}

/** Best-effort client IP from the platform's forwarded-for header. Falls
 * back to a shared bucket if unavailable (e.g. local dev without a proxy
 * setting it) rather than throwing — degrades gracefully, doesn't break. */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}

export function tooManyRequestsResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
