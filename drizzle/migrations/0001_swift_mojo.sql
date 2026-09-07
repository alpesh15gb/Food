ALTER TYPE "public"."delivery_status" ADD VALUE 'RIDER_GOING_TO_PICKUP' BEFORE 'PICKED_UP';--> statement-breakpoint
ALTER TYPE "public"."delivery_status" ADD VALUE 'IN_TRANSIT' BEFORE 'OUT_FOR_DELIVERY';--> statement-breakpoint
ALTER TYPE "public"."delivery_status" ADD VALUE 'CANCELLATION_PENDING';--> statement-breakpoint
ALTER TYPE "public"."delivery_status" ADD VALUE 'RETURNING_TO_RESTAURANT';--> statement-breakpoint
ALTER TYPE "public"."delivery_status" ADD VALUE 'RETURNED';--> statement-breakpoint
ALTER TYPE "public"."delivery_status" ADD VALUE 'DELIVERY_EXCEPTION';--> statement-breakpoint
ALTER TABLE "deliveries" DROP CONSTRAINT "delivery_status_allowed_chk";--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "provider_awb" varchar(120);--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_awb_unique_idx" ON "deliveries" USING btree ("provider_awb") WHERE "deliveries"."provider_awb" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "delivery_provider_status_idx" ON "deliveries" USING btree ("provider","status");--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "delivery_status_allowed_chk" CHECK ("deliveries"."status" IN ('PENDING','QUOTED','REQUESTED','ASSIGNED','RIDER_ASSIGNED','RIDER_GOING_TO_PICKUP','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','FAILED','CANCELLATION_PENDING','RETURNING_TO_RESTAURANT','RETURNED','DELIVERY_EXCEPTION'));