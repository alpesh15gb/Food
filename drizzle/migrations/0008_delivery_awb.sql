-- NOTE: drizzle-kit originally generated six ALTER TYPE delivery_status ADD
-- VALUE statements here. They were removed because (a) no column uses the
-- delivery_status enum (status columns are varchar + CHECK by design), and
-- (b) ADD VALUE cannot run inside the transaction drizzle wraps migrations
-- in, which aborted the entire migration run. The CHECK below is the real
-- constraint; the TS-level pgEnum in schema.ts stays as documentation.
ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "delivery_status_allowed_chk";
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "provider_awb" varchar(120);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_awb_unique_idx" ON "deliveries" USING btree ("provider_awb") WHERE "deliveries"."provider_awb" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_provider_status_idx" ON "deliveries" USING btree ("provider","status");
--> statement-breakpoint
DO $$
DECLARE
  stmt text;
BEGIN
  stmt := 'ALTER TABLE "deliveries" ADD CONSTRAINT "delivery_status_allowed_chk" CHECK ("deliveries"."status" IN (''PENDING'',''QUOTED'',''REQUESTED'',''ASSIGNED'',''RIDER_ASSIGNED'',''RIDER_GOING_TO_PICKUP'',''PICKED_UP'',''IN_TRANSIT'',''OUT_FOR_DELIVERY'',''DELIVERED'',''CANCELLED'',''FAILED'',''CANCELLATION_PENDING'',''RETURNING_TO_RESTAURANT'',''RETURNED'',''DELIVERY_EXCEPTION''))';
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = substring(stmt from 'ADD CONSTRAINT "?([^"]+)"?')
  ) THEN
    EXECUTE stmt;
  END IF;
END $$;
