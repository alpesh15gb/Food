-- Order timeline note visibility.
--
-- getOrderForTracking() promises it never exposes admin notes, but it selected
-- order_status_history.note unfiltered — so operator-typed cancellation/rejection
-- reasons were published to anyone holding the customer tracking link, including
-- the row written by admin dispatch:
--
--   "Shadowfax shipment created. AWB: SF1234567."
--
-- The AWB is the key the delivery provider's own tracking API uses, so this was a
-- genuine data leak, not cosmetic.
--
-- Fail closed: existing rows become "internal" and only rows explicitly marked
-- "customer" are returned by the public tracking endpoint. A new note is
-- therefore staff-only by default and has to be opted in, which is the safe
-- direction — forgetting to mark a note hides a row from the customer rather
-- than publishing one.

ALTER TABLE "order_status_history"
  ADD COLUMN IF NOT EXISTS "note_visibility" varchar(16) NOT NULL DEFAULT 'internal';
