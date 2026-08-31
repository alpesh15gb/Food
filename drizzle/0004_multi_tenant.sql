-- Multi-tenant: restaurant members, custom domains, theme fields

-- Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'restaurant_member_role') THEN
    CREATE TYPE "restaurant_member_role" AS ENUM ('owner', 'admin', 'manager', 'staff', 'kitchen');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ssl_status') THEN
    CREATE TYPE "ssl_status" AS ENUM ('pending', 'active', 'expired', 'failed');
  END IF;
END $$;

-- Restaurant Members
CREATE TABLE IF NOT EXISTS "restaurant_members" (
  "id" varchar(36) PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "restaurant_id" varchar(36) NOT NULL REFERENCES "restaurants"("id"),
  "role" "restaurant_member_role" NOT NULL DEFAULT 'staff',
  "invited_by_user_id" integer REFERENCES "users"("id"),
  "is_active" boolean NOT NULL DEFAULT true,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_member_user_idx" ON "restaurant_members" ("user_id", "restaurant_id");
CREATE INDEX IF NOT EXISTS "restaurant_member_restaurant_idx" ON "restaurant_members" ("restaurant_id");

-- Custom Domains
CREATE TABLE IF NOT EXISTS "custom_domains" (
  "id" varchar(36) PRIMARY KEY,
  "restaurant_id" varchar(36) NOT NULL REFERENCES "restaurants"("id"),
  "domain" varchar(253) NOT NULL UNIQUE,
  "is_verified" boolean NOT NULL DEFAULT false,
  "verified_at" timestamp,
  "ssl_status" "ssl_status" NOT NULL DEFAULT 'pending',
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "custom_domain_restaurant_idx" ON "custom_domains" ("restaurant_id");

-- Theme fields on restaurants
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'accent_color') THEN
    ALTER TABLE "restaurants" ADD COLUMN "accent_color" varchar(16) DEFAULT '#38271F';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'font_family') THEN
    ALTER TABLE "restaurants" ADD COLUMN "font_family" varchar(120) DEFAULT 'Playfair Display';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'body_font_family') THEN
    ALTER TABLE "restaurants" ADD COLUMN "body_font_family" varchar(120) DEFAULT 'Inter';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'favicon_url') THEN
    ALTER TABLE "restaurants" ADD COLUMN "favicon_url" text;
  END IF;
END $$;

-- Audit logs: add restaurant_id for tenant scoping
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'restaurant_id') THEN
    ALTER TABLE "audit_logs" ADD COLUMN "restaurant_id" varchar(36) REFERENCES "restaurants"("id");
    CREATE INDEX IF NOT EXISTS "audit_restaurant_idx" ON "audit_logs" ("restaurant_id");
  END IF;
END $$;

-- Users: add password_hash for email/password self-serve registration
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_hash') THEN
    ALTER TABLE "users" ADD COLUMN "password_hash" varchar(256);
  END IF;
END $$;

-- Billing: subscription plans and restaurant subscriptions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan') THEN
    CREATE TYPE "subscription_plan" AS ENUM ('free', 'pro', 'enterprise');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE "subscription_status" AS ENUM ('active', 'trialing', 'past_due', 'cancelled', 'expired');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" varchar(36) PRIMARY KEY,
  "name" varchar(120) NOT NULL,
  "tier" "subscription_plan" NOT NULL,
  "price_paise_monthly" integer NOT NULL DEFAULT 0,
  "features" jsonb NOT NULL DEFAULT '[]',
  "max_outlets" integer NOT NULL DEFAULT 1,
  "max_menu_items" integer NOT NULL DEFAULT 50,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "restaurant_subscriptions" (
  "id" varchar(36) PRIMARY KEY,
  "restaurant_id" varchar(36) NOT NULL REFERENCES "restaurants"("id"),
  "plan_id" varchar(36) NOT NULL REFERENCES "subscription_plans"("id"),
  "status" "subscription_status" NOT NULL DEFAULT 'trialing',
  "trial_ends_at" timestamp,
  "current_period_start" timestamp NOT NULL,
  "current_period_end" timestamp NOT NULL,
  "payment_provider_id" varchar(120),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "restaurant_subscription_idx" ON "restaurant_subscriptions" ("restaurant_id");

-- Inventory: enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_movement_type') THEN
    CREATE TYPE "stock_movement_type" AS ENUM ('IN', 'OUT', 'WASTAGE', 'ADJUSTMENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_reference_type') THEN
    CREATE TYPE "stock_reference_type" AS ENUM ('PURCHASE', 'SALE', 'WASTAGE', 'MANUAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_order_status') THEN
    CREATE TYPE "purchase_order_status" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED');
  END IF;
END $$;

-- Suppliers
CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" varchar(36) PRIMARY KEY,
  "restaurant_id" varchar(36) NOT NULL REFERENCES "restaurants"("id"),
  "name" varchar(180) NOT NULL,
  "phone" varchar(24),
  "email" varchar(320),
  "address" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "supplier_restaurant_idx" ON "suppliers" ("restaurant_id");

-- Raw Materials
CREATE TABLE IF NOT EXISTS "raw_materials" (
  "id" varchar(36) PRIMARY KEY,
  "restaurant_id" varchar(36) NOT NULL REFERENCES "restaurants"("id"),
  "name" varchar(180) NOT NULL,
  "unit" varchar(16) NOT NULL,
  "current_stock" numeric(12,3) NOT NULL DEFAULT 0,
  "min_stock" numeric(12,3) NOT NULL DEFAULT 0,
  "cost_per_unit_paise" integer NOT NULL DEFAULT 0,
  "supplier_id" varchar(36) REFERENCES "suppliers"("id"),
  "category" varchar(64),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "raw_material_restaurant_idx" ON "raw_materials" ("restaurant_id");

-- Recipes
CREATE TABLE IF NOT EXISTS "recipes" (
  "id" varchar(36) PRIMARY KEY,
  "menu_item_id" varchar(36) NOT NULL REFERENCES "menu_items"("id"),
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Recipe Ingredients
CREATE TABLE IF NOT EXISTS "recipe_ingredients" (
  "id" varchar(36) PRIMARY KEY,
  "recipe_id" varchar(36) NOT NULL REFERENCES "recipes"("id"),
  "raw_material_id" varchar(36) NOT NULL REFERENCES "raw_materials"("id"),
  "quantity_per_serving" numeric(12,3) NOT NULL,
  "unit" varchar(16) NOT NULL
);

-- Stock Movements
CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" varchar(36) PRIMARY KEY,
  "restaurant_id" varchar(36) NOT NULL REFERENCES "restaurants"("id"),
  "raw_material_id" varchar(36) NOT NULL REFERENCES "raw_materials"("id"),
  "type" "stock_movement_type" NOT NULL,
  "quantity" numeric(12,3) NOT NULL,
  "reference_type" "stock_reference_type" NOT NULL,
  "reference_id" varchar(64),
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "stock_movement_restaurant_idx" ON "stock_movements" ("restaurant_id");
CREATE INDEX IF NOT EXISTS "stock_movement_material_idx" ON "stock_movements" ("raw_material_id");

-- Purchase Orders
CREATE TABLE IF NOT EXISTS "purchase_orders" (
  "id" varchar(36) PRIMARY KEY,
  "restaurant_id" varchar(36) NOT NULL REFERENCES "restaurants"("id"),
  "supplier_id" varchar(36) REFERENCES "suppliers"("id"),
  "status" "purchase_order_status" NOT NULL DEFAULT 'DRAFT',
  "total_paise" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "received_at" timestamp
);
CREATE INDEX IF NOT EXISTS "po_restaurant_idx" ON "purchase_orders" ("restaurant_id");

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS "purchase_order_items" (
  "id" varchar(36) PRIMARY KEY,
  "purchase_order_id" varchar(36) NOT NULL REFERENCES "purchase_orders"("id"),
  "raw_material_id" varchar(36) NOT NULL REFERENCES "raw_materials"("id"),
  "quantity" numeric(12,3) NOT NULL,
  "unit_cost_paise" integer NOT NULL
);

-- Settings: add restaurant_id for per-tenant scoping
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'restaurant_id') THEN
    ALTER TABLE "settings" ADD COLUMN "restaurant_id" varchar(36) REFERENCES "restaurants"("id");
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'settings_key_unique') THEN
    DROP INDEX "settings_key_unique";
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "settings_key_restaurant_idx" ON "settings" ("key", "restaurant_id");

-- Order source tracking (aggregator integration)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_source') THEN
    CREATE TYPE "order_source" AS ENUM ('DIRECT', 'ZOMATO', 'SWIGGY', 'PHONE', 'WALK_IN');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'order_source') THEN
    ALTER TABLE "orders" ADD COLUMN "order_source" "order_source" NOT NULL DEFAULT 'DIRECT';
  END IF;
END $$;

-- Loyalty Program
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loyalty_transaction_type') THEN
    CREATE TYPE "loyalty_transaction_type" AS ENUM ('EARN', 'REDEEM', 'EXPIRE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "loyalty_programs" (
  "id" varchar(36) PRIMARY KEY,
  "restaurant_id" varchar(36) NOT NULL REFERENCES "restaurants"("id"),
  "name" varchar(120) NOT NULL DEFAULT 'Rewards',
  "points_per_rupee" numeric(5,2) NOT NULL DEFAULT 1,
  "redemption_rate_paise" integer NOT NULL DEFAULT 100,
  "max_redemption_percent" integer NOT NULL DEFAULT 50,
  "points_expiry_days" integer NOT NULL DEFAULT 365,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_program_restaurant_idx" ON "loyalty_programs" ("restaurant_id");

CREATE TABLE IF NOT EXISTS "loyalty_balances" (
  "id" varchar(36) PRIMARY KEY,
  "customer_id" varchar(36) NOT NULL REFERENCES "customer_profiles"("id"),
  "restaurant_id" varchar(36) NOT NULL REFERENCES "restaurants"("id"),
  "points" integer NOT NULL DEFAULT 0,
  "lifetime_points" integer NOT NULL DEFAULT 0,
  "tier" varchar(32) NOT NULL DEFAULT 'bronze',
  "last_earned_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_balance_customer_restaurant_idx" ON "loyalty_balances" ("customer_id", "restaurant_id");

CREATE TABLE IF NOT EXISTS "loyalty_transactions" (
  "id" varchar(36) PRIMARY KEY,
  "customer_id" varchar(36) NOT NULL REFERENCES "customer_profiles"("id"),
  "restaurant_id" varchar(36) NOT NULL REFERENCES "restaurants"("id"),
  "type" "loyalty_transaction_type" NOT NULL,
  "points" integer NOT NULL,
  "order_id" varchar(36),
  "description" varchar(300),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "loyalty_txn_customer_idx" ON "loyalty_transactions" ("customer_id", "restaurant_id");
