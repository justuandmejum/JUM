// Thin wrapper around Razorpay's REST API — no SDK dependency, since the
// surface we need (create an order, verify two kinds of HMAC signature) is
// small enough that a hand-rolled client is simpler than a whole package.
//
// Formulas verified directly against Razorpay's own docs (not assumed):
//  - Orders API: POST https://api.razorpay.com/v1/orders, Basic auth,
//    amount in the smallest currency subunit (paise for INR).
//  - Checkout success-callback signature: HMAC-SHA256(order_id + "|" +
//    payment_id, key_secret), hex digest, compared to razorpay_signature.
//  - Webhook signature: HMAC-SHA256(raw request body, webhook_secret), hex
//    digest, compared to the X-Razorpay-Signature header. Must be computed
//    over the raw, unparsed body.

import crypto from "node:crypto";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set.");
  }
  return { keyId, keySecret };
}

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
  status: string;
  receipt: string | null;
}

/** Creates a Razorpay order for `amountInr` rupees. `receipt` must be <=40 chars and unique. */
export async function createOrder(amountInr: number, receipt: string, notes?: Record<string, string>): Promise<RazorpayOrder> {
  const { keyId, keySecret } = getCredentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountInr * 100,
      currency: "INR",
      receipt,
      notes,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay order creation failed (${res.status}): ${body}`);
  }

  return res.json();
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  method: string; // "card" | "upi" | "netbanking" | "wallet" | "emi" | ...
  status: string;
}

/** Fetches a payment's details (notably its method) — used after signature
 * verification so the customer's actual payment method is recorded even
 * before/without a webhook arriving. */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  const { keyId, keySecret } = getCredentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(`${RAZORPAY_API_BASE}/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay payment fetch failed (${res.status}): ${body}`);
  }

  return res.json();
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number; // paise
  status: string; // "pending" | "processed" | "failed"
}

/** Creates a refund for a captured payment. Omit `amountInPaise` for a
 * full refund. `receipt` is Razorpay's idempotency key for refunds — a
 * retry with the same receipt is rejected as a duplicate rather than
 * double-refunding. */
export async function createRefund(paymentId: string, amountInPaise: number | undefined, receipt: string): Promise<RazorpayRefund> {
  const { keyId, keySecret } = getCredentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(`${RAZORPAY_API_BASE}/payments/${paymentId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: amountInPaise, receipt }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Razorpay refund failed (${res.status}): ${body}`);
  }

  return res.json();
}

/** Verifies the signature Checkout's client-side success handler returns.
 * `orderId` must come from our own records, not from the client request. */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const { keySecret } = getCredentials();
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return timingSafeEqualHex(expected, signature);
}

/** Verifies a webhook's X-Razorpay-Signature header against the raw request body. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not set.");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
