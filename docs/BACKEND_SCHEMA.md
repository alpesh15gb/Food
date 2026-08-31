# Backend Schema — 9House Kitchen

**Version:** 1.0  
**Date:** August 31, 2026  
**Database:** PostgreSQL 16  
**ORM:** Drizzle ORM (schema-first)  
**Tables:** 34 | **Enums:** 15

---

## Table of Contents

1. [Schema Overview](#1-schema-overview)
2. [Enums](#2-enums)
3. [Authentication & RBAC](#3-authentication--rbac)
4. [Customer Management](#4-customer-management)
5. [Restaurant & Outlet Management](#5-restaurant--outlet-management)
6. [Menu & Catalogue](#6-menu--catalogue)
7. [Cart](#7-cart)
8. [Orders](#8-orders)
9. [Payments & Refunds](#9-payments--refunds)
10. [Delivery](#10-delivery)
11. [Coupons & Promotions](#11-coupons--promotions)
12. [Webhooks](#12-webhooks)
13. [System & Configuration](#13-system--configuration)
14. [Entity Relationships](#14-entity-relationships)
15. [Indexes](#15-indexes)
16. [Seed Data](#16-seed-data)

---

## 1. Schema Overview

### Table Count by Domain

| Domain | Tables | Description |
|--------|--------|-------------|
| Auth & RBAC | 4 | Users, roles, permissions, assignments |
| Customers | 2 | Profiles, saved addresses |
| Restaurant | 4 | Restaurants, outlets, schedules |
| Menu | 7 | Categories, items, images, variants, addons, schedules |
| Cart | 2 | Shopping carts, cart items |
| Orders | 3 | Orders, items, status history |
| Payments | 2 | Payments, refunds |
| Delivery | 2 | Deliveries, status history |
| Promotions | 2 | Coupons, usage tracking |
| System | 4 | Settings, audit logs, webhooks, import jobs |
| **Total** | **34** | |

### Naming Conventions

| Convention | Example |
|-----------|---------|
| Table names | `snake_case` (e.g., `menu_items`, `order_status_history`) |
| Column names | `snake_case` (e.g., `price_paise`, `is_bestseller`) |
| Primary keys | `id` — `varchar(36)` for UUIDs, `serial` for auto-increment |
| Foreign keys | `{referenced_table}_id` (e.g., `restaurant_id`, `order_id`) |
| Timestamps | `created_at`, `updated_at` — `timestamp` with `defaultNow()` |
| Booleans | `is_` prefix (e.g., `is_open`, `is_active`, `is_bestseller`) |
| Money | `_paise` suffix (e.g., `price_paise`, `total_paise`) — integer |

---

## 2. Enums

All enums use PostgreSQL native `pgEnum` for type safety.

### `user_role`

```sql
CREATE TYPE user_role AS ENUM ('user', 'admin');
```

### `order_status`

```sql
CREATE TYPE order_status AS ENUM (
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'PLACED',
  'RESTAURANT_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'DELIVERY_REQUESTED',
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
  'REFUND_PENDING',
  'REFUNDED'
);
```

### `payment_status`

```sql
CREATE TYPE payment_status AS ENUM (
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED'
);
```

### `payment_provider_status`

```sql
CREATE TYPE payment_provider_status AS ENUM (
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'REFUNDED'
);
```

### `fulfillment_type`

```sql
CREATE TYPE fulfillment_type AS ENUM ('DELIVERY', 'PICKUP');
```

### `dietary_type`

```sql
CREATE TYPE dietary_type AS ENUM ('veg', 'nonveg', 'egg');
```

### `availability`

```sql
CREATE TYPE availability AS ENUM (
  'AVAILABLE',
  'SOLD_OUT',
  'SCHEDULED_UNAVAILABLE',
  'OUT_OF_STOCK',
  'DISABLED'
);
```

### `discount_type`

```sql
CREATE TYPE discount_type AS ENUM ('flat', 'percent');
```

### `address_label`

```sql
CREATE TYPE address_label AS ENUM ('Home', 'Work', 'Other');
```

### `modifier_selection_type`

```sql
CREATE TYPE modifier_selection_type AS ENUM ('single', 'multiple');
```

### `refund_status`

```sql
CREATE TYPE refund_status AS ENUM ('PENDING', 'PROCESSED', 'FAILED');
```

### `import_job_status`

```sql
CREATE TYPE import_job_status AS ENUM (
  'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
);
```

### `import_job_type`

```sql
CREATE TYPE import_job_type AS ENUM ('products', 'coupons', 'categories');
```

---

## 3. Authentication & RBAC

### `users`

Core user table for both customers and administrators.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `serial` PK | No | auto | Auto-increment ID |
| `open_id` | `varchar(64)` UNIQUE | No | — | External auth identifier |
| `name` | `text` | Yes | — | Display name |
| `email` | `varchar(320)` | Yes | — | Email address |
| `mobile` | `varchar(24)` | Yes | — | Phone number |
| `login_method` | `varchar(64)` | Yes | — | Auth method used |
| `role` | `user_role` | No | `'user'` | User or admin |
| `created_at` | `timestamp` | No | `now()` | Registration date |
| `updated_at` | `timestamp` | No | `now()` | Last update |
| `last_signed_in` | `timestamp` | No | `now()` | Last login time |

### `admin_roles`

RBAC role definitions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `varchar(36)` PK | No | — | Role identifier |
| `name` | `varchar(64)` UNIQUE | No | — | Role name |
| `description` | `text` | Yes | — | Role description |
| `is_system` | `boolean` | No | `false` | System role (non-deletable) |
| `created_at` | `timestamp` | No | `now()` | Creation date |

### `admin_role_permissions`

Granular permissions per role.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Record ID |
| `role_id` | `varchar(36)` | No | → `admin_roles.id` | Parent role |
| `permission` | `varchar(120)` | No | — | Permission string |

**Permission format:** `{resource}:{action}` (e.g., `orders:read`, `menu:write`, `payments:refund`)

### `admin_user_roles`

Links users to roles (many-to-many).

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Record ID |
| `user_id` | `integer` | No | → `users.id` | User reference |
| `role_id` | `varchar(36)` | No | → `admin_roles.id` | Role reference |
| `created_at` | `timestamp` | No | `now()` | Assignment date |

**Unique index:** `(user_id, role_id)`

---

## 4. Customer Management

### `customer_profiles`

Extended customer data linked to a user account.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | No | — | — | Customer ID |
| `user_id` | `integer` UNIQUE | No | → `users.id` | — | User reference |
| `mobile_number` | `varchar(24)` | Yes | — | — | Phone number |
| `preferred_name` | `varchar(120)` | Yes | — | — | Display name |
| `admin_notes` | `text` | Yes | — | — | Internal notes |
| `total_orders` | `integer` | No | — | `0` | Lifetime order count |
| `total_spent_paise` | `integer` | No | — | `0` | Lifetime spend (paise) |
| `created_at` | `timestamp` | No | — | `now()` | Registration date |
| `updated_at` | `timestamp` | No | — | `now()` | Last update |

### `customer_addresses`

Saved delivery addresses per customer.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | No | — | — | Address ID |
| `customer_id` | `varchar(36)` | No | → `customer_profiles.id` | — | Parent customer |
| `label` | `address_label` | No | — | `'Home'` | Address label |
| `flat_house` | `varchar(180)` | No | — | — | Flat/house number |
| `building` | `varchar(180)` | Yes | — | — | Building name |
| `street` | `varchar(180)` | Yes | — | — | Street name |
| `landmark` | `varchar(180)` | Yes | — | — | Nearby landmark |
| `area` | `varchar(180)` | No | — | — | Area/locality |
| `city` | `varchar(120)` | No | — | — | City |
| `postal_code` | `varchar(16)` | Yes | — | — | PIN code |
| `latitude` | `varchar(32)` | Yes | — | — | GPS latitude |
| `longitude` | `varchar(32)` | Yes | — | — | GPS longitude |
| `delivery_instructions` | `text` | Yes | — | — | Special instructions |
| `is_default` | `boolean` | No | — | `false` | Default address flag |
| `created_at` | `timestamp` | No | — | `now()` | Creation date |

---

## 5. Restaurant & Outlet Management

### `restaurants`

Primary restaurant/brand configuration.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `varchar(36)` PK | — | — | Restaurant ID |
| `slug` | `varchar(96)` UNIQUE | No | — | URL slug |
| `name` | `varchar(180)` | No | — | Display name |
| `description` | `text` | Yes | — | Long description |
| `cuisine_summary` | `varchar(255)` | No | — | Short cuisine line |
| `logo_url` | `text` | Yes | — | Logo image URL |
| `banner_image_url` | `text` | Yes | — | Hero banner URL |
| `primary_color` | `varchar(16)` | No | `'#C84630'` | Brand primary color |
| `secondary_color` | `varchar(16)` | No | `'#F7E4D3'` | Brand secondary color |
| `contact_phone` | `varchar(32)` | Yes | — | Contact number |
| `contact_email` | `varchar(320)` | Yes | — | Contact email |
| `address` | `text` | Yes | — | Full address |
| `latitude` | `varchar(32)` | Yes | — | GPS latitude |
| `longitude` | `varchar(32)` | Yes | — | GPS longitude |
| `gst_number` | `varchar(32)` | Yes | — | GST registration |
| `gst_percentage` | `numeric(5,2)` | Yes | `'0'` | GST rate |
| `delivery_fee_paise` | `integer` | No | `3900` | Default delivery fee |
| `packaging_fee_paise` | `integer` | No | `2500` | Default packaging fee |
| `min_order_paise` | `integer` | No | `19900` | Minimum order amount |
| `is_open` | `boolean` | No | `true` | Accepting orders |
| `opens_at` | `varchar(24)` | No | `'11:00 AM'` | Opens at (display) |
| `allow_scheduled_orders` | `boolean` | No | `true` | Allow future orders |
| `preparation_minutes` | `integer` | No | `25` | Default prep time |
| `delivery_radius_km` | `numeric(5,2)` | Yes | `'5'` | Delivery radius |
| `temp_closure_start` | `timestamp` | Yes | — | Temporary close start |
| `temp_closure_end` | `timestamp` | Yes | — | Temporary close end |
| `temp_closure_message` | `varchar(500)` | Yes | — | Closure message |
| `created_at` | `timestamp` | No | `now()` | Creation date |
| `updated_at` | `timestamp` | No | `now()` | Last update |

### `restaurant_schedules`

Per-day-of-week opening hours.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Schedule ID |
| `restaurant_id` | `varchar(36)` | No | → `restaurants.id` | Parent restaurant |
| `day_of_week` | `integer` | No | — | 0=Sunday, 6=Saturday |
| `open_time` | `varchar(8)` | No | — | e.g., "11:00 AM" |
| `close_time` | `varchar(8)` | No | — | e.g., "11:00 PM" |
| `is_active` | `boolean` | No | `true` | Schedule enabled |

**Unique index:** `(restaurant_id, day_of_week)`

### `outlets`

Physical kitchen locations.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Outlet ID |
| `restaurant_id` | `varchar(36)` | No | → `restaurants.id` | — | Parent restaurant |
| `name` | `varchar(180)` | No | — | — | Outlet name |
| `address` | `text` | No | — | — | Full address |
| `city` | `varchar(120)` | No | — | — | City |
| `postal_code` | `varchar(16)` | Yes | — | — | PIN code |
| `latitude` | `varchar(32)` | Yes | — | — | GPS latitude |
| `longitude` | `varchar(32)` | Yes | — | — | GPS longitude |
| `phone` | `varchar(24)` | Yes | — | — | Contact number |
| `preparation_minutes` | `integer` | No | `25` | Prep time override |
| `delivery_radius_km` | `numeric(5,2)` | Yes | `'5'` | Delivery radius |
| `is_active` | `boolean` | No | `true` | Outlet enabled |
| `is_open` | `boolean` | No | `true` | Currently accepting |
| `created_at` | `timestamp` | No | `now()` | Creation date |

### `outlet_schedules`

Per-day-of-week outlet hours (same structure as `restaurant_schedules`).

---

## 6. Menu & Catalogue

### `menu_categories`

Food categories (Biryani, Starters, etc.).

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Category ID |
| `restaurant_id` | `varchar(36)` | No | → `restaurants.id` | — | Parent restaurant |
| `name` | `varchar(120)` | No | — | — | Category name |
| `slug` | `varchar(120)` | No | — | — | URL slug |
| `description` | `text` | Yes | — | — | Description |
| `image_url` | `text` | Yes | — | — | Category image |
| `icon_emoji` | `varchar(8)` | Yes | — | — | Emoji icon |
| `sort_order` | `integer` | No | `0` | Display order |
| `is_visible` | `boolean` | No | `true` | Shown to customers |
| `is_open` | `boolean` | No | `true` | Currently active |
| `created_at` | `timestamp` | No | `now()` | Creation date |

**Unique index:** `(restaurant_id, slug)`

### `category_schedules`

Time-based category availability.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Schedule ID |
| `category_id` | `varchar(36)` | No | → `menu_categories.id` | Parent category |
| `day_of_week` | `integer` | Yes | — | 0=Sunday (null = any day) |
| `open_time` | `varchar(8)` | Yes | — | e.g., "7:00 AM" |
| `close_time` | `varchar(8)` | Yes | — | e.g., "11:00 AM" |
| `start_date` | `timestamp` | Yes | — | Date range start |
| `end_date` | `timestamp` | Yes | — | Date range end |
| `is_active` | `boolean` | No | `true` | Schedule enabled |

### `menu_items`

Individual food products.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Item ID |
| `restaurant_id` | `varchar(36)` | No | → `restaurants.id` | — | Parent restaurant |
| `category_id` | `varchar(36)` | No | → `menu_categories.id` | — | Parent category |
| `sku` | `varchar(64)` | Yes | — | — | Stock keeping unit |
| `name` | `varchar(180)` | No | — | — | Item name |
| `slug` | `varchar(180)` | Yes | — | — | URL slug |
| `description` | `text` | Yes | — | — | Full description |
| `short_description` | `varchar(300)` | Yes | — | — | Brief description |
| `price_paise` | `integer` | No | — | — | Base price (paise) |
| `offer_price_paise` | `integer` | Yes | — | — | Discounted price |
| `cost_price_paise` | `integer` | Yes | — | — | Cost price (admin) |
| `image_url` | `text` | Yes | — | — | Primary image |
| `dietary_type` | `dietary_type` | No | `'veg'` | — | Veg/non-veg/egg |
| `tag` | `varchar(48)` | Yes | — | — | Short tag |
| `is_bestseller` | `boolean` | No | `false` | — | Bestseller flag |
| `is_featured` | `boolean` | No | `false` | — | Featured flag |
| `is_recommended` | `boolean` | No | `false` | — | Recommended flag |
| `spice_level` | `smallint` | Yes | — | — | 0-5 spice indicator |
| `preparation_minutes` | `integer` | Yes | — | — | Item-specific prep time |
| `availability` | `availability` | No | `'AVAILABLE'` | — | Availability state |
| `available_note` | `varchar(160)` | Yes | — | — | "Sold out until 2pm" |
| `is_open` | `boolean` | No | `true` | — | ON/OFF toggle |
| `is_customizable` | `boolean` | No | `false` | — | Has variants/addons |
| `tax_percent` | `numeric(5,2)` | Yes | `'0'` | — | Tax rate |
| `packaging_fee_paise` | `integer` | Yes | `0` | — | Per-item packaging |
| `stock` | `integer` | Yes | — | — | Stock count (null = unlimited) |
| `max_quantity_per_order` | `integer` | Yes | `10` | — | Max qty per order |
| `sort_order` | `integer` | No | `0` | — | Display order |
| `tags` | `jsonb` | Yes | — | — | Search tags array |
| `created_at` | `timestamp` | No | `now()` | — | Creation date |
| `updated_at` | `timestamp` | No | `now()` | — | Last update |

**Indexes:** `(restaurant_id)`, `(category_id)`, `(restaurant_id, sku)`

### `menu_item_images`

Gallery images per menu item.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Image ID |
| `menu_item_id` | `varchar(36)` | No | → `menu_items.id` | Parent item |
| `image_url` | `text` | No | — | Image URL |
| `sort_order` | `integer` | No | `0` | Display order |
| `alt_text` | `varchar(255)` | Yes | — | Accessibility text |

### `product_schedules`

Time-based item availability.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Schedule ID |
| `menu_item_id` | `varchar(36)` | No | → `menu_items.id` | Parent item |
| `day_of_week` | `integer` | Yes | — | 0=Sunday (null = any day) |
| `open_time` | `varchar(8)` | Yes | — | Start time |
| `close_time` | `varchar(8)` | Yes | — | End time |
| `start_date` | `timestamp` | Yes | — | Date range start |
| `end_date` | `timestamp` | Yes | — | Date range end |
| `is_active` | `boolean` | No | `true` | Schedule enabled |

### `product_variants`

Size/variant options with pricing.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Variant ID |
| `menu_item_id` | `varchar(36)` | No | → `menu_items.id` | — | Parent item |
| `name` | `varchar(120)` | No | — | — | e.g., "Regular", "Large" |
| `price_paise` | `integer` | No | — | — | Variant price |
| `is_available` | `boolean` | No | `true` | — | Available flag |
| `sort_order` | `integer` | No | `0` | — | Display order |

### `addon_groups`

Modifier groups (e.g., "Extra Toppings", "Spice Level").

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Group ID |
| `menu_item_id` | `varchar(36)` | No | → `menu_items.id` | — | Parent item |
| `name` | `varchar(120)` | No | — | — | Group name |
| `selection_type` | `modifier_selection_type` | No | `'single'` | — | Single or multiple |
| `is_required` | `boolean` | No | `false` | — | Must select |
| `min_selections` | `integer` | No | `0` | — | Min choices |
| `max_selections` | `integer` | No | `1` | — | Max choices |
| `sort_order` | `integer` | No | `0` | — | Display order |

### `addon_options`

Individual options within an addon group.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Option ID |
| `addon_group_id` | `varchar(36)` | No | → `addon_groups.id` | — | Parent group |
| `name` | `varchar(120)` | No | — | — | Option name |
| `price_paise` | `integer` | No | `0` | — | Additional price |
| `is_available` | `boolean` | No | `true` | — | Available flag |
| `sort_order` | `integer` | No | `0` | — | Display order |

---

## 7. Cart

### `carts`

Shopping cart per customer or session.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Cart ID |
| `restaurant_id` | `varchar(36)` | No | → `restaurants.id` | Restaurant |
| `outlet_id` | `varchar(36)` | No | → `outlets.id` | Outlet |
| `customer_id` | `varchar(36)` | Yes | → `customer_profiles.id` | Logged-in customer |
| `session_key` | `varchar(96)` | Yes | — | Anonymous session key |
| `coupon_code` | `varchar(48)` | Yes | — | Applied coupon |
| `created_at` | `timestamp` | No | `now()` | Creation date |
| `updated_at` | `timestamp` | No | `now()` | Last update |

### `cart_items`

Items in a shopping cart.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Cart item ID |
| `cart_id` | `varchar(36)` | No | → `carts.id` | Parent cart |
| `menu_item_id` | `varchar(36)` | No | → `menu_items.id` | Menu item |
| `quantity` | `integer` | No | `1` | Quantity |
| `selected_variant_id` | `varchar(36)` | Yes | — | Selected variant |
| `selected_modifiers` | `jsonb` | No | `[]` | Modifier selections |
| `special_instructions` | `varchar(300)` | Yes | — | Cooking notes |
| `unit_price_paise` | `integer` | No | — | Price per unit |

**`selected_modifiers` JSONB schema:**
```json
[
  {
    "groupId": "addon_001",
    "groupName": "Size",
    "optionId": "opt_001",
    "optionName": "Large",
    "pricePaise": 200
  }
]
```

---

## 8. Orders

### `orders`

Complete order records.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Order ID |
| `order_number` | `varchar(32)` UNIQUE | No | — | — | Human-readable number |
| `restaurant_id` | `varchar(36)` | No | → `restaurants.id` | — | Restaurant |
| `outlet_id` | `varchar(36)` | No | → `outlets.id` | — | Outlet |
| `customer_id` | `varchar(36)` | Yes | → `customer_profiles.id` | — | Customer |
| `status` | `order_status` | No | `'PENDING_PAYMENT'` | — | Current status |
| `payment_status` | `payment_status` | No | `'PENDING'` | — | Payment state |
| `fulfillment_type` | `fulfillment_type` | No | `'DELIVERY'` | — | Delivery or pickup |
| `customer_name` | `varchar(180)` | Yes | — | — | Name snapshot |
| `customer_phone` | `varchar(24)` | Yes | — | — | Phone snapshot |
| `customer_email` | `varchar(320)` | Yes | — | — | Email snapshot |
| `address_snapshot` | `jsonb` | No | — | — | Immutable address |
| `item_total_paise` | `integer` | No | — | — | Subtotal |
| `discount_paise` | `integer` | No | `0` | — | Discount applied |
| `packaging_fee_paise` | `integer` | No | `0` | — | Packaging fee |
| `delivery_fee_paise` | `integer` | No | `0` | — | Delivery fee |
| `tax_paise` | `integer` | No | `0` | — | Tax amount |
| `total_paise` | `integer` | No | — | — | Grand total |
| `coupon_code` | `varchar(48)` | Yes | — | — | Applied coupon code |
| `coupon_discount_paise` | `integer` | No | `0` | — | Coupon discount |
| `delivery_notes` | `text` | Yes | — | — | Delivery instructions |
| `special_instructions` | `text` | Yes | — | — | Cooking instructions |
| `cutlery_preference` | `boolean` | No | `false` | — | Need cutlery |
| `estimated_minutes` | `integer` | Yes | — | — | ETA in minutes |
| `scheduled_for` | `timestamp` | Yes | — | — | Scheduled order time |
| `accepted_at` | `timestamp` | Yes | — | — | Kitchen accepted |
| `preparing_at` | `timestamp` | Yes | — | — | Preparation started |
| `ready_at` | `timestamp` | Yes | — | — | Ready for pickup |
| `delivered_at` | `timestamp` | Yes | — | — | Delivered |
| `cancelled_at` | `timestamp` | Yes | — | — | Cancelled |
| `cancel_reason` | `varchar(500)` | Yes | — | — | Cancellation reason |
| `created_at` | `timestamp` | No | `now()` | — | Order placed |
| `updated_at` | `timestamp` | No | `now()` | — | Last update |

**Indexes:** `(restaurant_id, status)`, `(customer_id)`, `(created_at)`

### `order_items`

Line items per order with immutable snapshots.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Order item ID |
| `order_id` | `varchar(36)` | No | → `orders.id` | Parent order |
| `menu_item_id` | `varchar(36)` | Yes | → `menu_items.id` | Source item |
| `item_name_snapshot` | `varchar(180)` | No | — | Name at time of order |
| `unit_price_paise` | `integer` | No | — | Price at time of order |
| `quantity` | `integer` | No | — | Quantity ordered |
| `dietary_type` | `dietary_type` | Yes | — | Diet type snapshot |
| `selected_variant_id` | `varchar(36)` | Yes | — | Variant reference |
| `variant_name_snapshot` | `varchar(120)` | Yes | — | Variant name snapshot |
| `selected_modifiers` | `jsonb` | No | `[]` | Modifier snapshot |
| `special_instructions` | `varchar(300)` | Yes | — | Cooking notes |

### `order_status_history`

Immutable timeline of status changes.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | History ID |
| `order_id` | `varchar(36)` | No | → `orders.id` | Parent order |
| `status` | `order_status` | No | — | Status at this point |
| `note` | `varchar(500)` | Yes | — | Optional note |
| `actor_id` | `integer` | Yes | → `users.id` | Who changed it |
| `created_at` | `timestamp` | No | `now()` | Timestamp |

**Index:** `(order_id, created_at)`

---

## 9. Payments & Refunds

### `payments`

Razorpay payment records.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Payment ID |
| `order_id` | `varchar(36)` | No | → `orders.id` | — | Parent order |
| `provider` | `varchar(64)` | No | `'razorpay'` | — | Payment provider |
| `provider_order_id` | `varchar(120)` | Yes | — | — | Razorpay order ID |
| `provider_payment_id` | `varchar(120)` | Yes | — | — | Razorpay payment ID |
| `status` | `payment_provider_status` | No | `'CREATED'` | — | Provider status |
| `amount_paise` | `integer` | No | — | — | Amount charged |
| `method` | `varchar(64)` | Yes | — | — | Payment method (upi, card, etc.) |
| `failure_reason` | `varchar(500)` | Yes | — | — | Failure details |
| `provider_payload` | `jsonb` | Yes | — | — | Raw provider response |
| `created_at` | `timestamp` | No | `now()` | — | Creation date |
| `updated_at` | `timestamp` | No | `now()` | — | Last update |

**Index:** `(order_id)`

### `refunds`

Refund records.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Refund ID |
| `payment_id` | `varchar(36)` | No | → `payments.id` | — | Source payment |
| `order_id` | `varchar(36)` | No | → `orders.id` | — | Parent order |
| `provider_refund_id` | `varchar(120)` | Yes | — | — | Razorpay refund ID |
| `amount_paise` | `integer` | No | — | — | Refund amount |
| `reason` | `varchar(500)` | Yes | — | — | Refund reason |
| `status` | `refund_status` | No | `'PENDING'` | — | Refund status |
| `initiated_by` | `integer` | Yes | → `users.id` | — | Admin who initiated |
| `provider_payload` | `jsonb` | Yes | — | — | Raw provider response |
| `created_at` | `timestamp` | No | `now()` | — | Creation date |
| `updated_at` | `timestamp` | No | `now()` | — | Last update |

---

## 10. Delivery

### `deliveries`

Shadowfax delivery records.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Delivery ID |
| `order_id` | `varchar(36)` | No | → `orders.id` | — | Parent order |
| `provider` | `varchar(64)` | No | `'shadowfax'` | — | Provider name |
| `provider_delivery_id` | `varchar(120)` | Yes | — | — | Shadowfax delivery ID |
| `tracking_id` | `varchar(120)` | Yes | — | — | Customer tracking ref |
| `status` | `varchar(64)` | No | `'PENDING'` | — | Current status |
| `rider_name` | `varchar(120)` | Yes | — | — | Assigned rider |
| `rider_phone` | `varchar(24)` | Yes | — | — | Rider phone |
| `rider_location` | `jsonb` | Yes | — | — | `{ lat, lng }` |
| `quoted_charge_paise` | `integer` | Yes | — | — | Estimated cost |
| `final_charge_paise` | `integer` | Yes | — | — | Actual cost |
| `estimated_pickup` | `timestamp` | Yes | — | — | ETA pickup |
| `estimated_delivery` | `timestamp` | Yes | — | — | ETA delivery |
| `actual_pickup` | `timestamp` | Yes | — | — | Actual pickup time |
| `actual_delivery` | `timestamp` | Yes | — | — | Actual delivery time |
| `tracking_url` | `varchar(500)` | Yes | — | — | Tracking page URL |
| `provider_payload` | `jsonb` | Yes | — | — | Raw provider response |
| `created_at` | `timestamp` | No | `now()` | — | Creation date |
| `updated_at` | `timestamp` | No | `now()` | — | Last update |

**Index:** `(order_id)`

### `delivery_status_history`

Timeline of delivery status changes.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | History ID |
| `delivery_id` | `varchar(36)` | No | → `deliveries.id` | Parent delivery |
| `status` | `varchar(64)` | No | — | Status string |
| `note` | `varchar(500)` | Yes | — | Optional note |
| `raw_payload` | `jsonb` | Yes | — | Full webhook payload |
| `created_at` | `timestamp` | No | `now()` | Timestamp |

**Index:** `(delivery_id, created_at)`

---

## 11. Coupons & Promotions

### `coupons`

Coupon definitions.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Coupon ID |
| `restaurant_id` | `varchar(36)` | No | → `restaurants.id` | — | Restaurant |
| `code` | `varchar(48)` | No | — | — | Coupon code |
| `description` | `varchar(255)` | No | — | — | Description |
| `discount_type` | `discount_type` | No | `'flat'` | — | Flat or percent |
| `discount_value` | `integer` | No | — | — | Discount amount |
| `min_order_paise` | `integer` | No | `0` | — | Minimum order |
| `max_discount_paise` | `integer` | Yes | — | — | Cap for percent |
| `total_usage_limit` | `integer` | Yes | — | — | Global limit |
| `per_customer_limit` | `integer` | Yes | `1` | — | Per-customer limit |
| `is_new_customer_only` | `boolean` | No | `false` | — | New customers only |
| `is_active` | `boolean` | No | `true` | — | Active flag |
| `starts_at` | `timestamp` | Yes | — | — | Valid from |
| `ends_at` | `timestamp` | Yes | — | — | Valid until |
| `created_at` | `timestamp` | No | `now()` | — | Creation date |

**Unique index:** `(restaurant_id, code)`

### `coupon_usage`

Tracks coupon redemptions.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Usage ID |
| `coupon_id` | `varchar(36)` | No | → `coupons.id` | Coupon used |
| `order_id` | `varchar(36)` | No | → `orders.id` | Order it was applied to |
| `customer_id` | `varchar(36)` | Yes | → `customer_profiles.id` | Who used it |
| `discount_paise` | `integer` | No | — | Discount amount |
| `created_at` | `timestamp` | No | `now()` | Redemption date |

**Index:** `(coupon_id, customer_id)`

---

## 12. Webhooks

### `webhook_events`

Idempotent webhook event tracking.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Event ID |
| `provider` | `varchar(64)` | No | — | Source provider |
| `event_type` | `varchar(120)` | No | — | Event type string |
| `external_id` | `varchar(120)` | Yes | — | Provider's event ID |
| `payload` | `jsonb` | No | — | Full event payload |
| `processed` | `boolean` | No | `false` | Processing status |
| `processing_error` | `varchar(1000)` | Yes | — | Error if failed |
| `created_at` | `timestamp` | No | `now()` | Received at |

**Unique index:** `(provider, external_id)` — prevents duplicate processing.

---

## 13. System & Configuration

### `settings`

Key-value configuration store.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Setting ID |
| `key` | `varchar(120)` UNIQUE | No | — | — | Setting key |
| `value` | `text` | Yes | — | — | Setting value |
| `category` | `varchar(64)` | No | `'general'` | — | Category group |
| `description` | `varchar(500)` | Yes | — | — | Human description |
| `updated_by` | `integer` | Yes | → `users.id` | — | Last editor |
| `created_at` | `timestamp` | No | `now()` | — | Creation date |
| `updated_at` | `timestamp` | No | `now()` | — | Last update |

### `integration_secrets`

Encrypted API credentials.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Secret ID |
| `restaurant_id` | `varchar(36)` | No | → `restaurants.id` | Restaurant |
| `provider` | `varchar(48)` | No | — | Provider name |
| `key_name` | `varchar(96)` | No | — | Secret key name |
| `cipher_text` | `text` | No | — | Encrypted value |
| `iv` | `varchar(64)` | No | — | Initialization vector |
| `auth_tag` | `varchar(64)` | No | — | Authentication tag |
| `updated_by_user_id` | `integer` | No | → `users.id` | Last editor |
| `created_at` | `timestamp` | No | `now()` | Creation date |
| `updated_at` | `timestamp` | No | `now()` | Last update |

**Unique index:** `(restaurant_id, provider, key_name)`

### `audit_logs`

Admin action audit trail.

| Column | Type | Nullable | FK | Description |
|--------|------|----------|-----|-------------|
| `id` | `varchar(36)` PK | No | — | Log ID |
| `actor_id` | `integer` | Yes | → `users.id` | Who did it |
| `actor_name` | `varchar(180)` | Yes | — | Name snapshot |
| `action` | `varchar(120)` | No | — | Action description |
| `target_type` | `varchar(64)` | No | — | Target entity type |
| `target_id` | `varchar(64)` | Yes | — | Target entity ID |
| `before_data` | `jsonb` | Yes | — | State before change |
| `after_data` | `jsonb` | Yes | — | State after change |
| `ip_address` | `varchar(64)` | Yes | — | Client IP |
| `created_at` | `timestamp` | No | `now()` | When it happened |

**Indexes:** `(actor_id)`, `(target_type, target_id)`

### `import_jobs`

Bulk import tracking.

| Column | Type | Nullable | FK | Default | Description |
|--------|------|----------|-----|---------|-------------|
| `id` | `varchar(36)` PK | — | — | — | Job ID |
| `restaurant_id` | `varchar(36)` | No | → `restaurants.id` | — | Restaurant |
| `type` | `import_job_type` | No | `'products'` | — | Import type |
| `status` | `import_job_status` | No | `'PENDING'` | — | Job status |
| `file_name` | `varchar(255)` | Yes | — | — | Source filename |
| `total_rows` | `integer` | Yes | `0` | — | Total rows |
| `processed_rows` | `integer` | Yes | `0` | — | Processed rows |
| `error_rows` | `integer` | Yes | `0` | — | Failed rows |
| `error_report_url` | `varchar(500)` | Yes | — | — | Error report URL |
| `created_by` | `integer` | Yes | → `users.id` | — | Who initiated |
| `created_at` | `timestamp` | No | `now()` | — | Creation date |
| `completed_at` | `timestamp` | Yes | — | — | Completion time |

---

## 14. Entity Relationships

```
                    ┌──────────────┐
                    │    users     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────────┐
              ▼            ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │admin_user_   │ │customer_     │ │  audit_logs  │
    │roles         │ │profiles      │ │              │
    └──────┬───────┘ └──────┬───────┘ └──────────────┘
           │                │
           ▼                ▼
    ┌──────────────┐ ┌──────────────┐
    │admin_roles   │ │customer_     │
    └──────┬───────┘ │addresses     │
           │         └──────────────┘
           ▼
    ┌──────────────┐
    │admin_role_   │
    │permissions   │
    └──────────────┘

    ┌──────────────┐
    │ restaurants  │─────────────────────────────────────┐
    └──────┬───────┘                                     │
           │                                             │
    ┌──────┼─────────────────────┐                       │
    ▼      ▼                     ▼                       ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│restaurant_   │ │   outlets    │ │menu_categories│ │  coupons     │
│schedules     │ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
└──────────────┘        │                │                │
                   ┌────┴──────┐   ┌────┴──────┐    ┌────┴──────┐
                   │outlet_    │   │category_  │    │coupon_    │
                   │schedules  │   │schedules  │    │usage      │
                   └───────────┘   └───────────┘    └───────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  menu_items  │──────┐
                              └──────┬───────┘      │
                                     │              │
                    ┌────────────────┼──────┐       │
                    ▼                ▼      ▼       ▼
             ┌──────────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐
             │menu_item_    │ │product_│ │addon_  │ │integration_  │
             │images        │ │variants│ │groups  │ │secrets       │
             └──────────────┘ └────────┘ └───┬────┘ └──────────────┘
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │addon_options  │
                                      └──────────────┘

    ┌──────────────┐
    │    carts     │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  cart_items  │
    └──────────────┘

    ┌──────────────┐
    │    orders    │──────┐
    └──────┬───────┘      │
           │              │
    ┌──────┼────────┐     │
    ▼      ▼        ▼     ▼
┌────────┐┌────────┐┌────────┐┌────────┐
│order_  ││order_  ││payments││deliver-│
│items   ││status_ ││        ││ies     │
│        ││history ││   │    ││   │    │
└────────┘└────────┘│   ▼    ││   ▼    │
                    │┌──────┐││┌──────┐│
                    ││refunds│││deliv-││
                    │└──────┘││ery_  ││
                    └────────┘│status││
                              │_hist-││
                              │ory   ││
                              └──────┘│
                                       │
                              ┌────────┘
                              ▼
                       ┌──────────────┐
                       │webhook_events│
                       └──────────────┘

    ┌──────────────┐    ┌──────────────┐
    │   settings   │    │ import_jobs  │
    └──────────────┘    └──────────────┘
```

---

## 15. Indexes

### Primary Key Indexes

All tables have primary key indexes (implicit).

### Unique Indexes

| Table | Columns | Purpose |
|-------|---------|---------|
| `users` | `open_id` | Unique auth identifier |
| `admin_roles` | `name` | Unique role name |
| `admin_user_roles` | `(user_id, role_id)` | One role per user |
| `menu_categories` | `(restaurant_id, slug)` | Unique slug per restaurant |
| `restaurants` | `slug` | Unique restaurant slug |
| `coupons` | `(restaurant_id, code)` | Unique code per restaurant |
| `orders` | `order_number` | Unique order number |
| `integration_secrets` | `(restaurant_id, provider, key_name)` | Unique secret key |
| `settings` | `key` | Unique setting key |
| `webhook_events` | `(provider, external_id)` | Idempotent webhook processing |

### Performance Indexes

| Table | Columns | Query Pattern |
|-------|---------|---------------|
| `menu_items` | `restaurant_id` | Menu listing |
| `menu_items` | `category_id` | Category filtering |
| `menu_items` | `(restaurant_id, sku)` | SKU lookup (import) |
| `orders` | `(restaurant_id, status)` | Order filtering |
| `orders` | `customer_id` | Customer order history |
| `orders` | `created_at` | Time-based queries |
| `payments` | `order_id` | Payment lookup |
| `deliveries` | `order_id` | Delivery lookup |
| `category_schedules` | `category_id` | Schedule lookup |
| `product_schedules` | `menu_item_id` | Schedule lookup |
| `coupon_usage` | `(coupon_id, customer_id)` | Usage validation |
| `audit_logs` | `actor_id` | Actor lookup |
| `audit_logs` | `(target_type, target_id)` | Target lookup |
| `order_status_history` | `(order_id, created_at)` | Timeline queries |
| `delivery_status_history` | `(delivery_id, created_at)` | Timeline queries |

---

## 16. Seed Data

### Initial Restaurant

| Field | Value |
|-------|-------|
| Name | Spice Garden |
| Slug | spice-garden |
| Cuisine | Indian • Biryani • Kebabs |
| Primary color | #C84630 |
| Delivery fee | ₹30 |
| Packaging fee | ₹25 |
| Min order | ₹199 |
| Preparation time | 25 minutes |

### Initial Categories (9)

| Name | Emoji | Sort Order |
|------|-------|-----------|
| Biryani | 🍛 | 1 |
| Starters | 🍗 | 2 |
| Breads | 🫓 | 3 |
| Rice & Noodles | 🍚 | 4 |
| South Indian | 🥞 | 5 |
| Snacks | 🍟 | 6 |
| Combos | 🍱 | 7 |
| Desserts | 🍨 | 8 |
| Beverages | 🥤 | 9 |

### Initial Menu Items (35+)

Includes dishes across all categories with realistic Indian food pricing:
- Chicken Biryani ₹280, Mutton Biryani ₹350, Veg Biryani ₹220
- Paneer Tikka ₹280, Chicken Wings ₹250, Seekh Kebab ₹320
- Butter Naan ₹60, Garlic Naan ₹80, Tandoori Roti ₹50
- And 25+ more items with variants, add-ons, and dietary tags

### Initial Admin Role

| Role | Permissions |
|------|------------|
| Super Admin | All permissions (orders:*, menu:*, payments:*, customers:*, settings:*, integrations:*) |
| Operations Manager | orders:*, menu:*, customers:*, reports:* |
| Kitchen Manager | orders:read, orders:update_status |
| Catalogue Manager | menu:* |

---

*Document generated for 9House Kitchen — Cloud-Kitchen Ordering Platform*  
*Database: PostgreSQL 16 | ORM: Drizzle | Tables: 34 | Enums: 15*
