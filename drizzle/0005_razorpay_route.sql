-- Razorpay Route: split settlement columns

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'razorpay_account_id') THEN
    ALTER TABLE "restaurants" ADD COLUMN "razorpay_account_id" varchar(64);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'platform_fee_percent') THEN
    ALTER TABLE "restaurants" ADD COLUMN "platform_fee_percent" numeric(5,2) DEFAULT '0';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'razorpay_account_status') THEN
    ALTER TABLE "restaurants" ADD COLUMN "razorpay_account_status" varchar(32) DEFAULT 'not_linked';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'transfer_amount_paise') THEN
    ALTER TABLE "payments" ADD COLUMN "transfer_amount_paise" integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'platform_fee_paise') THEN
    ALTER TABLE "payments" ADD COLUMN "platform_fee_paise" integer;
  END IF;
END $$;

-- Unique index on users.email (partial, non-null only) to prevent duplicate registration
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique_idx" ON "users" ("email") WHERE "email" IS NOT NULL;
