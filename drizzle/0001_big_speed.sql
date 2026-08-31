CREATE TABLE "otp_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar(15) NOT NULL,
	"code" varchar(64) NOT NULL,
	"purpose" varchar(32) DEFAULT 'login' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "external_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_token" varchar(36) NOT NULL;--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_verifications" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "otp_lookup_idx" ON "otp_verifications" USING btree ("phone","purpose","used_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tracking_token_unique" UNIQUE("tracking_token");