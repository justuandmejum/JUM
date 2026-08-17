-- Prevents two bookings from ever holding/occupying the same date + start
-- time simultaneously. This is a *partial* unique index — it only applies
-- while a booking is in an active state, so completed/cancelled/failed
-- bookings never block a slot from being reused.
--
-- This is the actual mechanism that stops "Person A -> 6pm, Person B -> 6pm,
-- both pay" from being possible: if two requests race to insert a
-- TEMPORARILY_HELD row for the same slot, Postgres itself rejects the
-- second one with a unique violation — enforced at the database level, not
-- just checked in application code before an insert.
CREATE UNIQUE INDEX "bookings_active_slot_unique"
ON "bookings" ("date", "startTime")
WHERE "bookingStatus" IN ('TEMPORARILY_HELD', 'PAYMENT_PENDING', 'CONFIRMED');
