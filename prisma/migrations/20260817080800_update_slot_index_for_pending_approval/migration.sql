-- Extends the double-booking-prevention index (see
-- 20260817072322_add_slot_unique_index) to also reserve a slot during the
-- PENDING_APPROVAL window, not just once a booking is held/paid/confirmed.
-- Split into its own migration (rather than combined with the enum change
-- in 20260817080744_add_pending_approval_status) because Postgres won't
-- let a newly added enum value be used in the same transaction that added
-- it.
DROP INDEX "bookings_active_slot_unique";

CREATE UNIQUE INDEX "bookings_active_slot_unique"
ON "bookings" ("date", "startTime")
WHERE "bookingStatus" IN ('PENDING_APPROVAL', 'TEMPORARILY_HELD', 'PAYMENT_PENDING', 'CONFIRMED');
