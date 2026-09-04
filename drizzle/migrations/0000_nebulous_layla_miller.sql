-- P0 hardening delta (idempotent).
-- NOTE: drizzle's snapshot (meta/0000_snapshot.json) was generated from the
-- current schema.ts, so future `db:generate` diffs are correct. This .sql file
-- was hand-written as an IDEMPOTENT delta because production was created via
-- `db:push` (no journal history): every statement is safe to run against a DB
-- that already has all tables. Fresh databases should use `pnpm db:push`
-- (dev) instead of this file.
-- Deliberately OMITTED (applied later after data cleanup, see schema.ts):
--   * CHECK constraints on money/stock/status (existing rows like DISPATCHING
--     deliveries would violate them; app code validates instead)
--   * FK ON DELETE behavior changes (unknown existing constraint names)
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(64);--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD COLUMN IF NOT EXISTS "restaurant_id" varchar(36);--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "payment_id" varchar(36);--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN IF NOT EXISTS "max_redemption_paise" integer;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "latitude_num" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "longitude_num" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "latitude_num" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "longitude_num" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN IF NOT EXISTS "latitude_num" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "outlets" ADD COLUMN IF NOT EXISTS "longitude_num" numeric(9, 6);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_user_roles_restaurant_id_fkey') THEN
    ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_events_payment_id_fkey') THEN
    ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outlet_restaurant_idx" ON "outlets" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_payment_idx" ON "webhook_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coupon_usage_idx" ON "coupon_usage" USING btree ("coupon_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loyalty_txn_customer_idx" ON "loyalty_transactions" USING btree ("customer_id","restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loyalty_txn_order_idx" ON "loyalty_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_restaurant_idx" ON "purchase_orders" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_material_restaurant_idx" ON "raw_materials" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_domain_restaurant_idx" ON "custom_domains" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurant_subscription_idx" ON "restaurant_subscriptions" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_order_idx" ON "deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_idempotency_key_unique_idx" ON "orders" USING btree ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_provider_order_unique_idx" ON "payments" USING btree ("provider_order_id") WHERE "provider_order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_provider_payment_unique_idx" ON "payments" USING btree ("provider_payment_id") WHERE "provider_payment_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "refund_provider_unique_idx" ON "refunds" USING btree ("provider_refund_id") WHERE "provider_refund_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_usage_order_unique_idx" ON "coupon_usage" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_order_live_unique_idx" ON "deliveries" USING btree ("order_id") WHERE "status" NOT IN ('CANCELLED', 'FAILED');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_provider_unique_idx" ON "deliveries" USING btree ("provider_delivery_id") WHERE "provider_delivery_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "otp_active_unique_idx" ON "otp_verifications" USING btree ("phone","purpose") WHERE "used_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_permission_unique_idx" ON "admin_role_permissions" USING btree ("role_id","permission");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_user_role_idx" ON "admin_user_roles" USING btree ("user_id","role_id") WHERE "restaurant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_user_role_scoped_idx" ON "admin_user_roles" USING btree ("user_id","restaurant_id","role_id") WHERE "restaurant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_address_default_unique_idx" ON "customer_addresses" USING btree ("customer_id") WHERE "is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_sku_unique_idx" ON "menu_items" USING btree ("restaurant_id","sku") WHERE "sku" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "custom_domain_primary_unique_idx" ON "custom_domains" USING btree ("restaurant_id") WHERE "is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_subscription_active_unique_idx" ON "restaurant_subscriptions" USING btree ("restaurant_id") WHERE "status" IN ('active', 'trialing');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settings_global_key_unique_idx" ON "settings" USING btree ("key") WHERE "restaurant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settings_scoped_key_unique_idx" ON "settings" USING btree ("key","restaurant_id") WHERE "restaurant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_balance_customer_restaurant_idx" ON "loyalty_balances" USING btree ("customer_id","restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_program_restaurant_idx" ON "loyalty_programs" USING btree ("restaurant_id");--> statement-breakpoint
