ALTER TABLE "otp_verifications" ADD COLUMN "expected_sender" varchar(32);--> statement-breakpoint
ALTER TABLE "otp_verifications" ADD COLUMN "received_at" timestamp;--> statement-breakpoint
ALTER TABLE "otp_verifications" ADD COLUMN "wa_message_id" varchar(128);