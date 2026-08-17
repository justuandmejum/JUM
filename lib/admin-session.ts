// Real admin authentication for Phase 7 — replaces the shared-secret
// ADMIN_API_KEY stand-in (lib/admin-auth.ts) as the dashboard's own auth
// path. No JWT/session-library dependency: password hashing uses Node's
// built-in scrypt, and the session cookie is a base64 payload + HMAC-SHA256
// signature (same pattern already used for Razorpay's own signatures in
// lib/razorpay.ts) — enough for a single-admin pilot without adding a
// dependency or a sessions table.
import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "jum_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set.");
  return secret;
}

// --- Password hashing (scrypt, salt:hash hex format) ------------------------

export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      const stored = Buffer.from(hashHex, "hex");
      resolve(stored.length === derivedKey.length && crypto.timingSafeEqual(stored, derivedKey));
    });
  });
}

// --- Session cookie -----------------------------------------------------------

export interface SessionPayload {
  adminId: string;
  email: string;
  role: string;
  expiresAt: number;
  csrfToken: string;
}

/** Creates a session token, generating a fresh CSRF synchronizer token
 * bound to it (not independently guessable, and only readable by the
 * legitimate session holder via GET /api/admin/me — not attacker-controlled,
 * so a cross-site request can carry the cookie automatically but not this). */
export function createSessionToken(payload: Omit<SessionPayload, "expiresAt" | "csrfToken">): string {
  const full: SessionPayload = { ...payload, expiresAt: Date.now() + SESSION_TTL_MS, csrfToken: crypto.randomBytes(24).toString("hex") };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const signature = crypto.createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE_NAME, SESSION_TTL_MS };

/** Builds a Set-Cookie header value. Pass null to clear the cookie (logout). */
export function buildSessionCookieHeader(token: string | null): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  if (token === null) {
    return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}
