CREATE TYPE "public"."address_label" AS ENUM('Home', 'Work', 'Other');--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('AVAILABLE', 'SOLD_OUT', 'SCHEDULED_UNAVAILABLE', 'OUT_OF_STOCK', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."dietary_type" AS ENUM('veg', 'nonveg', 'egg');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('flat', 'percent');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_type" AS ENUM('DELIVERY', 'PICKUP');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."import_job_type" AS ENUM('products', 'coupons', 'categories');--> statement-breakpoint
CREATE TYPE "public"."modifier_selection_type" AS ENUM('single', 'multiple');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'PLACED', 'RESTAURANT_ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERY_REQUESTED', 'RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REJECTED', 'REFUND_PENDING', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payment_provider_status" AS ENUM('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "addon_groups" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"menu_item_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"selection_type" "modifier_selection_type" DEFAULT 'single' NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"min_selections" integer DEFAULT 0 NOT NULL,
	"max_selections" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "addon_options" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"addon_group_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"price_paise" integer DEFAULT 0 NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_role_permissions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"role_id" varchar(36) NOT NULL,
	"permission" varchar(120) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "admin_user_roles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"actor_name" varchar(180),
	"action" varchar(120) NOT NULL,
	"target_type" varchar(64) NOT NULL,
	"target_id" varchar(64),
	"before_data" jsonb,
	"after_data" jsonb,
	"ip_address" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"cart_id" varchar(36) NOT NULL,
	"menu_item_id" varchar(36) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"selected_variant_id" varchar(36),
	"selected_modifiers" jsonb NOT NULL,
	"special_instructions" varchar(300),
	"unit_price_paise" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"outlet_id" varchar(36) NOT NULL,
	"customer_id" varchar(36),
	"session_key" varchar(96),
	"coupon_code" varchar(48),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_schedules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"category_id" varchar(36) NOT NULL,
	"day_of_week" integer,
	"open_time" varchar(8),
	"close_time" varchar(8),
	"start_date" timestamp,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_usage" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"coupon_id" varchar(36) NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"customer_id" varchar(36),
	"discount_paise" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"code" varchar(48) NOT NULL,
	"description" varchar(255) NOT NULL,
	"discount_type" "discount_type" DEFAULT 'flat' NOT NULL,
	"discount_value" integer NOT NULL,
	"min_order_paise" integer DEFAULT 0 NOT NULL,
	"max_discount_paise" integer,
	"total_usage_limit" integer,
	"per_customer_limit" integer DEFAULT 1,
	"is_new_customer_only" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"customer_id" varchar(36) NOT NULL,
	"label" "address_label" DEFAULT 'Home' NOT NULL,
	"flat_house" varchar(180) NOT NULL,
	"building" varchar(180),
	"street" varchar(180),
	"landmark" varchar(180),
	"area" varchar(180) NOT NULL,
	"city" varchar(120) NOT NULL,
	"postal_code" varchar(16),
	"latitude" varchar(32),
	"longitude" varchar(32),
	"delivery_instructions" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"mobile_number" varchar(24),
	"preferred_name" varchar(120),
	"admin_notes" text,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_spent_paise" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"provider" varchar(64) DEFAULT 'shadowfax' NOT NULL,
	"provider_delivery_id" varchar(120),
	"tracking_id" varchar(120),
	"status" varchar(64) DEFAULT 'PENDING' NOT NULL,
	"rider_name" varchar(120),
	"rider_phone" varchar(24),
	"rider_location" jsonb,
	"quoted_charge_paise" integer,
	"final_charge_paise" integer,
	"estimated_pickup" timestamp,
	"estimated_delivery" timestamp,
	"actual_pickup" timestamp,
	"actual_delivery" timestamp,
	"tracking_url" varchar(500),
	"provider_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_status_history" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"delivery_id" varchar(36) NOT NULL,
	"status" varchar(64) NOT NULL,
	"note" varchar(500),
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"type" "import_job_type" DEFAULT 'products' NOT NULL,
	"status" "import_job_status" DEFAULT 'PENDING' NOT NULL,
	"file_name" varchar(255),
	"total_rows" integer DEFAULT 0,
	"processed_rows" integer DEFAULT 0,
	"error_rows" integer DEFAULT 0,
	"error_report_url" varchar(500),
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "integration_secrets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"provider" varchar(48) NOT NULL,
	"key_name" varchar(96) NOT NULL,
	"cipher_text" text NOT NULL,
	"iv" varchar(64) NOT NULL,
	"auth_tag" varchar(64) NOT NULL,
	"updated_by_user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text,
	"image_url" text,
	"icon_emoji" varchar(8),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item_images" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"menu_item_id" varchar(36) NOT NULL,
	"image_url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"alt_text" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"category_id" varchar(36) NOT NULL,
	"sku" varchar(64),
	"name" varchar(180) NOT NULL,
	"slug" varchar(180),
	"description" text,
	"short_description" varchar(300),
	"price_paise" integer NOT NULL,
	"offer_price_paise" integer,
	"cost_price_paise" integer,
	"image_url" text,
	"dietary_type" "dietary_type" DEFAULT 'veg' NOT NULL,
	"tag" varchar(48),
	"is_bestseller" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"spice_level" smallint,
	"preparation_minutes" integer,
	"availability" "availability" DEFAULT 'AVAILABLE' NOT NULL,
	"available_note" varchar(160),
	"is_open" boolean DEFAULT true NOT NULL,
	"is_customizable" boolean DEFAULT false NOT NULL,
	"tax_percent" numeric(5, 2) DEFAULT '0',
	"packaging_fee_paise" integer DEFAULT 0,
	"stock" integer,
	"max_quantity_per_order" integer DEFAULT 10,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"tags" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"menu_item_id" varchar(36),
	"item_name_snapshot" varchar(180) NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"quantity" integer NOT NULL,
	"dietary_type" "dietary_type",
	"selected_variant_id" varchar(36),
	"variant_name_snapshot" varchar(120),
	"selected_modifiers" jsonb NOT NULL,
	"special_instructions" varchar(300)
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"status" "order_status" NOT NULL,
	"note" varchar(500),
	"actor_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"order_number" varchar(32) NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"outlet_id" varchar(36) NOT NULL,
	"customer_id" varchar(36),
	"status" "order_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"fulfillment_type" "fulfillment_type" DEFAULT 'DELIVERY' NOT NULL,
	"customer_name" varchar(180),
	"customer_phone" varchar(24),
	"customer_email" varchar(320),
	"address_snapshot" jsonb NOT NULL,
	"item_total_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"packaging_fee_paise" integer DEFAULT 0 NOT NULL,
	"delivery_fee_paise" integer DEFAULT 0 NOT NULL,
	"tax_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer NOT NULL,
	"coupon_code" varchar(48),
	"coupon_discount_paise" integer DEFAULT 0 NOT NULL,
	"delivery_notes" text,
	"special_instructions" text,
	"cutlery_preference" boolean DEFAULT false NOT NULL,
	"estimated_minutes" integer,
	"scheduled_for" timestamp,
	"accepted_at" timestamp,
	"preparing_at" timestamp,
	"ready_at" timestamp,
	"delivered_at" timestamp,
	"cancelled_at" timestamp,
	"cancel_reason" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "outlet_schedules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"outlet_id" varchar(36) NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" varchar(8) NOT NULL,
	"close_time" varchar(8) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"name" varchar(180) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(120) NOT NULL,
	"postal_code" varchar(16),
	"latitude" varchar(32),
	"longitude" varchar(32),
	"phone" varchar(24),
	"preparation_minutes" integer DEFAULT 25 NOT NULL,
	"delivery_radius_km" numeric(5, 2) DEFAULT '5',
	"is_active" boolean DEFAULT true NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"provider" varchar(64) DEFAULT 'razorpay' NOT NULL,
	"provider_order_id" varchar(120),
	"provider_payment_id" varchar(120),
	"status" "payment_provider_status" DEFAULT 'CREATED' NOT NULL,
	"amount_paise" integer NOT NULL,
	"method" varchar(64),
	"failure_reason" varchar(500),
	"provider_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_schedules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"menu_item_id" varchar(36) NOT NULL,
	"day_of_week" integer,
	"open_time" varchar(8),
	"close_time" varchar(8),
	"start_date" timestamp,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"menu_item_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"price_paise" integer NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"payment_id" varchar(36) NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"provider_refund_id" varchar(120),
	"amount_paise" integer NOT NULL,
	"reason" varchar(500),
	"status" "refund_status" DEFAULT 'PENDING' NOT NULL,
	"initiated_by" integer,
	"provider_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_schedules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" varchar(8) NOT NULL,
	"close_time" varchar(8) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"cuisine_summary" varchar(255) NOT NULL,
	"logo_url" text,
	"banner_image_url" text,
	"primary_color" varchar(16) DEFAULT '#C84630' NOT NULL,
	"secondary_color" varchar(16) DEFAULT '#F7E4D3' NOT NULL,
	"contact_phone" varchar(32),
	"contact_email" varchar(320),
	"address" text,
	"latitude" varchar(32),
	"longitude" varchar(32),
	"gst_number" varchar(32),
	"gst_percentage" numeric(5, 2) DEFAULT '0',
	"delivery_fee_paise" integer DEFAULT 3900 NOT NULL,
	"packaging_fee_paise" integer DEFAULT 2500 NOT NULL,
	"min_order_paise" integer DEFAULT 19900 NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"opens_at" varchar(24) DEFAULT '11:00 AM' NOT NULL,
	"allow_scheduled_orders" boolean DEFAULT true NOT NULL,
	"preparation_minutes" integer DEFAULT 25 NOT NULL,
	"delivery_radius_km" numeric(5, 2) DEFAULT '5',
	"temp_closure_start" timestamp,
	"temp_closure_end" timestamp,
	"temp_closure_message" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"key" varchar(120) NOT NULL,
	"value" text,
	"category" varchar(64) DEFAULT 'general' NOT NULL,
	"description" varchar(500),
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"mobile" varchar(24),
	"login_method" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"provider" varchar(64) NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"external_id" varchar(120),
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processing_error" varchar(1000),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addon_groups" ADD CONSTRAINT "addon_groups_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addon_options" ADD CONSTRAINT "addon_options_addon_group_id_addon_groups_id_fk" FOREIGN KEY ("addon_group_id") REFERENCES "public"."addon_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_schedules" ADD CONSTRAINT "category_schedules_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_images" ADD CONSTRAINT "menu_item_images_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet_schedules" ADD CONSTRAINT "outlet_schedules_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_schedules" ADD CONSTRAINT "product_schedules_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_schedules" ADD CONSTRAINT "restaurant_schedules_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_user_role_idx" ON "admin_user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "cat_schedule_idx" ON "category_schedules" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "coupon_usage_idx" ON "coupon_usage" USING btree ("coupon_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_code_per_restaurant" ON "coupons" USING btree ("restaurant_id","code");--> statement-breakpoint
CREATE INDEX "delivery_order_idx" ON "deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "delivery_history_idx" ON "delivery_status_history" USING btree ("delivery_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_secret_key_idx" ON "integration_secrets" USING btree ("restaurant_id","provider","key_name");--> statement-breakpoint
CREATE UNIQUE INDEX "category_slug_per_restaurant" ON "menu_categories" USING btree ("restaurant_id","slug");--> statement-breakpoint
CREATE INDEX "menu_item_restaurant_idx" ON "menu_items" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "menu_item_category_idx" ON "menu_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "menu_item_sku_idx" ON "menu_items" USING btree ("restaurant_id","sku");--> statement-breakpoint
CREATE INDEX "order_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_restaurant_status_idx" ON "orders" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "order_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outlet_schedule_day_idx" ON "outlet_schedules" USING btree ("outlet_id","day_of_week");--> statement-breakpoint
CREATE INDEX "outlet_restaurant_idx" ON "outlets" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "payment_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "product_schedule_idx" ON "product_schedules" USING btree ("menu_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rest_schedule_day_idx" ON "restaurant_schedules" USING btree ("restaurant_id","day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_idx" ON "webhook_events" USING btree ("provider","external_id");