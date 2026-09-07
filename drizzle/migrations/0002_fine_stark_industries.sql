ALTER TABLE "deliveries" ADD COLUMN "provider_status" varchar(120);--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "dispatched_at" timestamp;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "picked_up_at" timestamp;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "out_for_delivery_at" timestamp;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "last_webhook_at" timestamp;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "last_synced_at" timestamp;