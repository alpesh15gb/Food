ALTER TABLE "otp_verifications" ADD COLUMN IF NOT EXISTS "expected_sender" varchar(32);
--> statement-breakpoint
ALTER TABLE "otp_verifications" ADD COLUMN IF NOT EXISTS "received_at" timestamp;
--> statement-breakpoint
ALTER TABLE "otp_verifications" ADD COLUMN IF NOT EXISTS "wa_message_id" varchar(128);
