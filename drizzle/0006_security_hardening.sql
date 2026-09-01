-- Security hardening migration
-- L-08: Prevent duplicate refund records from webhook reprocessing
CREATE UNIQUE INDEX IF NOT EXISTS "refunds_provider_refund_unique" ON "refunds" ("provider_refund_id") WHERE "provider_refund_id" IS NOT NULL;

-- Ensure webhook_events external_id is unique per provider (already has composite unique index, verify)
-- The existing webhook_event_idx on (provider, external_id) already handles dedup.
