-- Migration 0001: OTP verifications, tracking tokens, webhook fixes
-- Safe for both clean databases and databases where otp_verifications
-- may already exist from a previous push --force with varchar(6).

-- 1. Create otp_verifications if it doesn't exist
CREATE TABLE IF NOT EXISTS "otp_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar(15) NOT NULL,
	"code" varchar(64) NOT NULL,
	"purpose" varchar(32) DEFAULT 'login' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- 2. If table exists but code column is too narrow (varchar(6) from earlier push),
--    widen it to varchar(64) to hold HMAC-SHA256 hashes.
--    This is safe: existing 6-char values fit in varchar(64).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'otp_verifications'
    AND column_name = 'code'
    AND character_maximum_length < 64
  ) THEN
    ALTER TABLE "otp_verifications" ALTER COLUMN "code" TYPE varchar(64);
  END IF;
END $$;

-- 3. Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "otp_phone_idx" ON "otp_verifications" USING btree ("phone");
CREATE INDEX IF NOT EXISTS "otp_lookup_idx" ON "otp_verifications" USING btree ("phone","purpose","used_at");

-- 4. Add tracking token to orders (safe: ADD COLUMN IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders'
    AND column_name = 'tracking_token'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "tracking_token" varchar(36) NOT NULL DEFAULT '';
    -- Backfill existing rows with unique tokens
    UPDATE "orders" SET "tracking_token" = encode(gen_random_bytes(24), 'base64')
    WHERE "tracking_token" = '';
    ALTER TABLE "orders" ALTER COLUMN "tracking_token" DROP DEFAULT;
  END IF;
END $$;

ALTER TABLE "orders" ADD CONSTRAINT "orders_tracking_token_unique" UNIQUE("tracking_token");

-- 5. Make webhook_events.external_id NOT NULL (safe if already set)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events'
    AND column_name = 'external_id'
    AND is_nullable = 'YES'
  ) THEN
    -- First backfill any NULLs
    UPDATE "webhook_events" SET "external_id" = 'unknown' WHERE "external_id" IS NULL;
    ALTER TABLE "webhook_events" ALTER COLUMN "external_id" SET NOT NULL;
  END IF;
END $$;

-- 6. Create unique index on customer_profiles.mobile_number
--    PRECONDITION: No duplicate non-null mobile numbers exist.
--    Run the preflight check before applying this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'customer_phone_unique'
  ) THEN
    CREATE UNIQUE INDEX "customer_phone_unique" ON "customer_profiles" ("mobile_number");
  END IF;
END $$;

-- 7. Invalidate legacy plaintext OTP rows.
--    After switching to HMAC-SHA256, any old 6-digit plaintext codes stored
--    in otp_verifications.code will never match HMAC verification.
--    Expire them NOW by setting used_at so they are never used again.
--    We identify legacy rows by length(code) <= 8 (plausible for a 6-digit OTP
--    with optional whitespace, vs 64-char hex HMAC hash).
UPDATE "otp_verifications"
SET "used_at" = NOW()
WHERE "used_at" IS NULL
  AND LENGTH("code") <= 8;

-- 8. Guest identity no longer uses phone-derived openId.
--    Existing 'guest_+91XXXXXXXXXX' or 'guest_XXXXXXXXXX' rows will
--    become orphaned (no orders reference them via customer_profiles).
--    This is safe: they contain no verified identity.
--    Optionally clean them up (commented out — manual review preferred):
-- DELETE FROM customer_profiles WHERE customer_profiles.user_id IN
--   (SELECT id FROM users WHERE open_id LIKE 'guest_%');
-- DELETE FROM users WHERE open_id LIKE 'guest_%';
