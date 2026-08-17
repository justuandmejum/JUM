import type { NextRequest } from "next/server";
import { createDonationOrder } from "../../../../../../lib/donations";
import { BookingError } from "../../../../../../lib/bookings";

export const dynamic = "force-dynamic";

// Public: freeform sustainability-donation amount, from the post-call
// feedback page's "Felt like more?" panel.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { amountInr } = body;
  if (typeof amountInr !== "number" || !Number.isInteger(amountInr)) {
    return Response.json({ error: "'amountInr' is required and must be a whole number." }, { status: 400 });
  }

  try {
    const order = await createDonationOrder(amountInr, id);
    return Response.json(order);
  } catch (err) {
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
