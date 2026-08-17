import type { NextRequest } from "next/server";
import { submitFeedback } from "../../../../../lib/feedback";
import { BookingError, InvalidBookingStateError } from "../../../../../lib/bookings";

export const dynamic = "force-dynamic";

const MAX_COMMENT_LEN = 2000;

// Public: the customer submits this from the post-call feedback page.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { rating, comment } = body;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: "'rating' is required and must be a whole number from 1 to 5." }, { status: 400 });
  }
  if (comment !== undefined && typeof comment !== "string") {
    return Response.json({ error: "'comment' must be a string." }, { status: 400 });
  }
  if (typeof comment === "string" && comment.length > MAX_COMMENT_LEN) {
    return Response.json({ error: `'comment' must be ${MAX_COMMENT_LEN} characters or fewer.` }, { status: 400 });
  }

  try {
    const feedback = await submitFeedback(id, rating, comment);
    return Response.json({ feedback });
  } catch (err) {
    if (err instanceof InvalidBookingStateError) return Response.json({ error: err.message }, { status: 409 });
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
