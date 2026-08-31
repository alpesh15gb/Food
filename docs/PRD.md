# Product Requirements Document (PRD)

## 9House Kitchen — Cloud-Kitchen Ordering Platform

**Version:** 1.0  
**Date:** August 31, 2026  
**Domain:** 9housekitchen.in  
**Status:** Pre-Launch (MVP)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Vision](#3-product-vision)
4. [Target Users](#4-target-users)
5. [Feature Requirements](#5-feature-requirements)
   - 5.1 Customer Storefront
   - 5.2 Admin Panel
   - 5.3 Backend Services
   - 5.4 Payment Integration
   - 5.5 Delivery Integration
   - 5.6 Security & Compliance
6. [Information Architecture](#6-information-architecture)
7. [Data Model](#7-data-model)
8. [Order Lifecycle](#8-order-lifecycle)
9. [Payment Flow](#9-payment-flow)
10. [Delivery Flow](#10-delivery-flow)
11. [Business Rules](#11-business-rules)
12. [Technical Architecture](#12-technical-architecture)
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Deployment & Infrastructure](#14-deployment--infrastructure)
15. [Testing Strategy](#15-testing-strategy)
16. [Success Metrics](#16-success-metrics)
17. [Launch Checklist](#17-launch-checklist)
18. [Future Roadmap](#18-future-roadmap)

---

## 1. Executive Summary

9House Kitchen is a cloud-kitchen business operating from a single brand ("Spice Garden") with multiple physical outlets. The platform provides a direct-to-consumer food ordering experience (website-based, mobile-optimized) bypassing aggregator platforms like Swiggy/Zomato, giving the kitchen full control over branding, pricing, customer relationships, and margins.

The platform consists of three integrated components:

| Component | Purpose |
|-----------|---------|
| **Customer Storefront** | Mobile-first food ordering website with search, menu browsing, cart, checkout, and order tracking |
| **Admin Panel** | Operations dashboard for order management, menu CRUD, scheduling, coupons, customer management, and reporting |
| **Backend API** | Express + tRPC server handling authentication, business logic, payment processing, delivery dispatch, and webhook processing |

---

## 2. Problem Statement

Cloud kitchens in India face several operational challenges:

1. **Aggregator Dependency** — Swiggy/Zomato charge 15-30% commission per order, significantly eroding margins
2. **No Direct Customer Relationship** — Customer data, ordering patterns, and loyalty belong to the aggregator
3. **Complex Menu Management** — Multiple items, variants, add-ons, schedules, and availability states require robust tooling
4. **Delivery Coordination** — Dispatching riders, tracking delivery status, and handling failures need automation
5. **Payment Reconciliation** — Manual payment tracking is error-prone at scale
6. **Operational Visibility** — Real-time order pipeline, sales analytics, and performance metrics are critical for daily operations

**This platform solves all of these** by providing a self-hosted, full-stack ordering system that the kitchen controls end-to-end.

---

## 3. Product Vision

### Core Principles

1. **Direct Ordering First** — The platform is the primary ordering channel, not a secondary option
2. **Mobile-Optimized** — 80%+ of food orders in India come from mobile devices; the storefront must feel native-like on phones
3. **Kitchen-First Admin** — The admin panel must be fast and usable on tablets during peak hours (e.g., a kitchen manager accepting orders on an iPad)
4. **Reliable Payments** — Every payment is server-verified; no frontend-submitted totals are trusted
5. **Operational Transparency** — Full audit trail for every admin action, order state change, and system event

### What This Is NOT

- This is NOT a Swiggy/Zomato clone — it's a direct-ordering system for a single brand
- This is NOT a POS system — it's a delivery/pickup-first platform
- This is NOT a multi-tenant SaaS (yet) — it's designed for 9House Kitchen's own operations

---

## 4. Target Users

### Primary Users

| Persona | Role | Key Needs |
|---------|------|-----------|
| **Customer** | End-user placing food orders via 9housekitchen.in | Fast browsing, easy search, simple checkout, order tracking, payment options |
| **Kitchen Manager** | Operations staff managing the admin panel | Accept/reject orders quickly, update preparation status, manage menu availability |
| **Restaurant Owner** | Business operator overseeing all operations | Dashboard metrics, sales reports, coupon management, integration setup, customer insights |

### Secondary Users

| Persona | Role | Key Needs |
|---------|------|-----------|
| **Delivery Partner** | Shadowfax rider fulfilling deliveries | Pickup/drop info, navigation, delivery confirmation |
| **Customer Support** | Staff handling customer queries | Order history lookup, refund processing, customer notes |
| **Finance** | Staff reviewing payments and reconciliation | Payment status, refund tracking, reconciliation reports |

---

## 5. Feature Requirements

### 5.1 Customer Storefront

#### 5.1.1 Homepage

| Feature | Priority | Description |
|---------|----------|-------------|
| Delivery location selector | P0 | Customer sets delivery address/pincode before browsing |
| Restaurant info | P0 | Brand name, cuisine summary, open/closed status, estimated delivery time |
| Category carousel | P0 | Horizontal scrollable category chips for quick navigation |
| Featured items | P0 | Recommended and bestseller items prominently displayed |
| Search | P0 | Full-text search across item names, descriptions, cuisines, and tags |
| Recently ordered | P1 | Logged-in users see their recent orders for quick reorder |

#### 5.1.2 Menu / Restaurant Page

| Feature | Priority | Description |
|---------|----------|-------------|
| Sticky category navigation | P0 | Horizontal category bar that sticks while scrolling the menu |
| Item cards | P0 | Name, image, description, price (with offer price), dietary type (veg/non-veg/egg), bestseller badge |
| Quick ADD button | P0 | Single-tap add for simple items (qty 1) |
| Customization modal | P0 | Opens when item has variants or add-ons; allows selection before adding to cart |
| Dietary filters | P0 | Toggle between veg, non-veg, and all items |
| Availability state | P0 | Sold-out items shown dimmed with "Sold Out" overlay; disabled items hidden |
| Minimum order display | P1 | Show minimum order amount and gap to qualify |
| Offer banner | P1 | Display active promotions/coupons on restaurant page |

#### 5.1.3 Search

| Feature | Priority | Description |
|---------|----------|-------------|
| Full-text search | P0 | Search across item name, description, category, cuisine, and tags |
| Debounced input | P0 | 300ms debounce to avoid excessive API calls |
| Search filters | P0 | Veg/Non-veg, Bestseller, Price range, Category |
| Empty state | P0 | Friendly "No items found" with suggestion to try different terms |

#### 5.1.4 Cart

| Feature | Priority | Description |
|---------|----------|-------------|
| Single-restaurant cart | P0 | Cart restricted to one restaurant/outlet at a time |
| Quantity adjustment | P0 | +/- buttons to change item quantity; item removed at qty 0 |
| Variant display | P0 | Show selected variant name in cart |
| Add-on display | P0 | Show selected add-ons with individual prices |
| Special instructions | P1 | Per-item cooking instructions (max 300 chars) |
| Coupon application | P0 | Enter coupon code, validate server-side, apply discount |
| Price breakdown | P0 | Subtotal, discounts, taxes, packaging fee, delivery fee, total |
| Sticky mobile CTA | P0 | Bottom cart bar showing item count and total with "View Cart" button |

#### 5.1.5 Checkout

| Feature | Priority | Description |
|---------|----------|-------------|
| Guest checkout | P0 | Place order with just phone number and address (no account required) |
| Saved addresses | P1 | Logged-in users can select from saved addresses |
| Address form | P0 | Flat/house, building, street, landmark, area, city, pincode, delivery instructions |
| Address labels | P0 | Home/Work/Other label for each saved address |
| Payment method selection | P0 | Razorpay checkout (cards, UPI, netbanking, wallets) |
| Order summary | P0 | Full price breakdown before payment |
| Delivery time estimate | P0 | Show estimated delivery time based on restaurant prep time + delivery |
| Server-side validation | P0 | Before accepting order, revalidate: restaurant open, items available, prices current, coupon valid, serviceable area, stock available |

#### 5.1.6 Order Tracking

| Feature | Priority | Description |
|---------|----------|-------------|
| Order status timeline | P0 | Visual timeline showing order progress through states |
| Kitchen status | P0 | Whether order is accepted, preparing, or ready |
| Delivery status | P1 | Rider assignment, pickup, out for delivery, delivered |
| Order details | P0 | Order number, items, payment status, total, delivery address |
| Rider info | P1 | Rider name, phone, tracking URL (when available from Shadowfax) |

---

### 5.2 Admin Panel

#### 5.2.1 Dashboard

| Feature | Priority | Description |
|---------|----------|-------------|
| KPI cards | P0 | Today's orders, today's sales, net sales, AOV, pending orders, preparing, ready, out for delivery, completed, cancelled, refunds, new customers |
| Sales chart | P1 | Daily sales trend over selected period |
| Orders chart | P1 | Daily order count trend |
| Hourly distribution | P2 | Orders per hour heatmap |
| Payment methods | P2 | Pie chart of payment method distribution |
| Top products | P1 | Ranked list of best-selling items |
| Top categories | P1 | Revenue by category |
| Date range selector | P0 | Today, Yesterday, Last 7 days, Last 30 days, This month, Previous month, Custom range |

#### 5.2.2 Order Management

| Feature | Priority | Description |
|---------|----------|-------------|
| Order pipeline view | P0 | Filter tabs: New, Paid, Confirmed, Preparing, Ready, Delivery Assigned, Out for Delivery, Delivered, Cancelled |
| Order details panel | P0 | Customer info, address, items (with variants/add-ons), payment, kitchen status, delivery status, full timeline |
| Accept order | P0 | Transition order to "Accepted" state |
| Reject order | P0 | With reason; transition to "Rejected" |
| Start preparing | P0 | Transition to "Preparing" |
| Mark ready | P0 | Transition to "Ready for Pickup" |
| Request delivery | P0 | Trigger Shadowfax dispatch |
| Cancel order | P0 | With reason; trigger refund if payment was captured |
| Initiate refund | P0 | Full or partial refund via Razorpay |
| View delivery tracking | P1 | Show Shadowfax tracking URL and rider status |
| Order action audit log | P0 | Every admin action logged with timestamp, actor, and metadata |

#### 5.2.3 Menu Management

| Feature | Priority | Description |
|---------|----------|-------------|
| Category CRUD | P0 | Create, edit, delete, reorder categories; toggle visibility |
| Category scheduling | P1 | Set availability by day-of-week and time range (e.g., Breakfast 7-11 AM) |
| Item CRUD | P0 | Create, edit, delete items with all fields (name, description, price, offer price, food type, preparation time, tags, etc.) |
| Item ON/OFF toggle | P0 | Large visible toggle to enable/disable item availability |
| Item scheduling | P1 | Set availability by day, time range, or date range |
| Variant management | P0 | Add/remove variants (e.g., Regular, Large) with individual pricing |
| Add-on groups | P0 | Create add-on groups (e.g., "Extra Cheese", "Spice Level") with options and prices |
| Image upload | P1 | Upload and replace item images (stored in S3-compatible storage) |
| Bestseller/Featured/Recommended flags | P0 | Toggle these flags per item |
| Stock tracking | P1 | Set stock quantity; auto-disable when stock reaches 0 |

#### 5.2.4 Bulk Import / Export

| Feature | Priority | Description |
|---------|----------|-------------|
| CSV export | P0 | Export menu items with all fields for backup/spreadsheet editing |
| CSV import | P0 | Upload CSV to create/update items in bulk |
| Import preview | P0 | Show parsed rows with validation errors before committing |
| Update-by-SKU | P0 | Re-import existing items by matching SKU |
| Error report | P1 | Downloadable error report for failed rows |
| Background processing | P2 | Large imports processed via background job queue |

#### 5.2.5 Coupon Management

| Feature | Priority | Description |
|---------|----------|-------------|
| Create coupon | P0 | Code, description, discount type (flat/percentage), discount value |
| Minimum order amount | P0 | Minimum cart value required to apply |
| Maximum discount cap | P0 | Cap on percentage discounts |
| Usage limits | P0 | Total usage limit and per-customer limit |
| Date range | P0 | Start and end dates for coupon validity |
| Active/inactive toggle | P0 | Enable/disable without deleting |
| New customer only | P1 | Restrict to first-time customers |

#### 5.2.6 Customer Management

| Feature | Priority | Description |
|---------|----------|-------------|
| Customer list | P1 | Name, mobile, email, registration date, total orders, lifetime value, AOV |
| Customer detail view | P1 | Order history, addresses, coupons used, admin notes |
| Search/filter | P1 | By name, email, mobile, order number |
| Admin notes | P1 | Internal notes about customers (visible only to admin) |
| Cancelled orders count | P1 | Track customer cancellation rate |

#### 5.2.7 Reporting

| Feature | Priority | Description |
|---------|----------|-------------|
| Sales reports | P0 | Gross sales, net sales, order count, AOV, taxes, packaging, delivery, discounts, refunds, cancelled value |
| Product reports | P1 | Top selling items, units sold, item revenue, category revenue, low-performing products |
| Customer reports | P1 | New vs returning customers, repeat rate, CLV, order frequency |
| Payment reports | P1 | Razorpay payments, status, failed payments, refunds, method distribution, reconciliation |
| Delivery reports | P2 | Shadowfax deliveries, success rate, rider assignment time, pickup time, delivery time, cost, failures |
| Date filter | P0 | All reports support preset and custom date ranges |
| CSV/XLSX export | P1 | Download report data as spreadsheet |

#### 5.2.8 Restaurant Settings

| Feature | Priority | Description |
|---------|----------|-------------|
| Restaurant ON/OFF switch | P0 | Manual toggle to immediately prevent new orders |
| Business hours | P0 | Per-day-of-week open/close times with cross-midnight support |
| Temporary closure | P0 | Set start/end datetime with closure message |
| Preparation time | P0 | Default preparation time in minutes |
| Minimum order | P0 | Minimum order amount in paise |
| Delivery fee | P0 | Default delivery fee in paise |
| Packaging fee | P0 | Default packaging fee in paise |
| GST settings | P1 | GST number and percentage |
| Contact details | P0 | Phone, email, address |
| Brand assets | P1 | Logo and banner image upload |
| Coordinates | P1 | Latitude/longitude for serviceability calculation |

#### 5.2.9 Integration Settings

| Feature | Priority | Description |
|---------|----------|-------------|
| Razorpay configuration | P0 | Key ID, Key Secret, Webhook Secret (stored encrypted) |
| Shadowfax configuration | P1 | API Key, Merchant ID, Webhook Secret (stored encrypted) |
| Connection test | P1 | Verify credentials are valid before enabling |
| Sandbox/Live toggle | P0 | Switch between test and production Razorpay keys |
| Setup checklist | P1 | Step-by-step guide showing what's configured and what's missing |

#### 5.2.10 Admin Roles & Permissions (RBAC)

| Role | Access Level |
|------|-------------|
| **Super Admin** | Full access to everything including integration secrets |
| **Operations Manager** | Orders, menu, customers, reports, restaurant settings |
| **Kitchen Manager** | Order operations (accept/reject/preparing/ready); no financial data |
| **Catalogue Manager** | Menu CRUD, categories, bulk import/export; no orders or payments |
| **Finance** | Reports, payments, refunds; no menu or order operations |
| **Customer Support** | Order lookup, customer profiles; cannot modify menu or pricing |

---

### 5.3 Backend Services

#### 5.3.1 Scheduling Engine

| Requirement | Description |
|-------------|-------------|
| Timezone-aware | All times computed in `Asia/Kolkata` (IST, UTC+5:30) |
| Cross-midnight support | Schedule `10 PM – 2 AM` correctly spans midnight |
| Weekday rules | Day-of-week based availability (e.g., Mon-Fri 9-11 PM) |
| Date ranges | Start/end date for temporary schedules (e.g., festival specials) |
| Multiple schedules | Category/item can have multiple schedule rules |
| Manual override | ON/OFF toggle takes precedence over schedule |
| Real-time computation | Availability computed from database state in real-time (no stale cache) |

#### 5.3.2 Availability Hierarchy

Effective item availability is the AND of all these conditions:

```
Item Available = 
  Restaurant.enabled = true
  AND Restaurant.currently scheduled open
  AND Restaurant.not in temporary closure
  AND Outlet.enabled = true
  AND Outlet.currently scheduled open
  AND Category.visible = true
  AND Category.currently scheduled open
  AND Item.enabled = true
  AND Item.currently scheduled open
  AND Item.availability ≠ SOLD_OUT/DISABLED
  AND Item.stock > 0 (or stock tracking disabled)
```

This hierarchy is implemented as a reusable server-side service used by:
- Storefront menu display
- Cart item validation
- Checkout order creation
- Admin availability preview

#### 5.3.3 Order State Machine

15 validated order states:

```
PENDING_PAYMENT
  → PAYMENT_CONFIRMED (payment webhook received)
  → CANCELLED (timeout or customer cancel)

PAYMENT_CONFIRMED / PLACED
  → RESTAURANT_ACCEPTED (admin accepts)
  → REJECTED (admin rejects → refund if paid)
  → CANCELLED (admin cancels → refund if paid)

RESTAURANT_ACCEPTED
  → PREPARING (kitchen starts)

PREPARING
  → READY_FOR_PICKUP (kitchen marks ready)

READY_FOR_PICKUP
  → DELIVERY_REQUESTED (dispatch to Shadowfax)

DELIVERY_REQUESTED
  → RIDER_ASSIGNED (Shadowfax assigns rider)

RIDER_ASSIGNED
  → PICKED_UP (rider picks up)

PICKED_UP
  → OUT_FOR_DELIVERY (rider en route)

OUT_FOR_DELIVERY
  → DELIVERED (rider confirms delivery)

DELIVERED
  → REFUND_PENDING (admin initiates refund)
  → REFUNDED (refund processed)

Any state before DELIVERED
  → CANCELLED (admin cancels → refund if paid)
```

**Rules:**
- Every state transition is validated; illegal transitions are rejected
- Every transition is logged in `order_status_history` with timestamp, actor, and note
- Payment status is mapped automatically (e.g., transitioning to REJECTED triggers refund_pending)

#### 5.3.4 Pricing Engine

All pricing is computed server-side. The frontend never submits trusted totals.

```
item_total = sum(item.unit_price × item.quantity + sum(selected_modifiers.price))
discount = coupon.discount applied against item_total (capped at max_discount)
packaging = restaurant.packaging_fee + sum(item.packaging_fee × quantity)
delivery = restaurant.delivery_fee
tax = item_total × restaurant.gst_percentage
total = item_total - discount + packaging + delivery + tax
```

**Validation at checkout:**
- Restaurant is open and accepting orders
- Outlet is active and serviceable for the delivery address
- Every item in cart is currently available
- Every item's price matches the current database price
- Coupon is valid (date range, usage limits, minimum order)
- Stock is sufficient for requested quantities
- Order total meets minimum order requirement
- Delivery address is within serviceable radius

---

### 5.4 Payment Integration — Razorpay

#### 5.4.1 Payment Flow

```
1. Customer proceeds to checkout
2. Backend validates cart, calculates final amount
3. Backend creates internal order (status: PENDING_PAYMENT)
4. Backend creates Razorpay Order via Orders API (amount in paise)
5. Backend returns { razorpayKeyId, razorpayOrderId } to frontend
6. Frontend opens Razorpay Checkout overlay
7. Customer completes payment in Razorpay
8. Frontend receives payment_id, order_id, signature
9. Frontend sends these to backend verification endpoint
10. Backend verifies HMAC signature server-side
11. If valid: mark order as PAYMENT_CONFIRMED, record payment details
12. If invalid: mark order as PAYMENT_FAILED
```

#### 5.4.2 Webhook Handling

| Event | Action |
|-------|--------|
| `payment.captured` | Confirm payment, update order status |
| `payment.failed` | Mark payment failed, update order status |
| `refund.created` | Update refund status to PENDING |
| `refund.processed` | Update refund status to PROCESSED |
| `refund.failed` | Update refund status to FAILED |

**Idempotency:** Every webhook event is recorded in `webhook_events` with `provider + externalId` unique constraint. Duplicate events are detected and skipped.

#### 5.4.3 Refund Support

| Feature | Description |
|---------|-------------|
| Full refund | Refund entire order amount |
| Partial refund | Refund a portion (e.g., one item from multi-item order) |
| Refund reasons | Required for audit trail |
| Refund tracking | Status lifecycle: PENDING → PROCESSED / FAILED |
| Admin-initiated | Only admins with finance permissions can initiate refunds |

#### 5.4.4 Configuration

| Mode | Environment | Key Format |
|------|------------|------------|
| TEST | Development | `rzp_test_xxxxx` |
| LIVE | Production | `rzp_live_xxxxx` |

Credentials stored encrypted in `integration_secrets` table (AES-256-GCM). Never exposed to frontend or logs.

---

### 5.5 Delivery Integration — Shadowfax

#### 5.5.1 Provider Interface

```typescript
interface DeliveryProvider {
  checkServiceability(params): Promise<ServiceabilityResult>
  getDeliveryQuote(params): Promise<DeliveryQuote>
  createDelivery(params): Promise<DeliveryResult>
  getDelivery(deliveryId): Promise<DeliveryStatus>
  cancelDelivery(deliveryId): Promise<CancelResult>
  handleWebhook(payload): Promise<WebhookResult>
}
```

#### 5.5.2 Delivery Workflow

```
1. Customer places paid order
2. Kitchen accepts order
3. System calculates expected preparation completion time
4. When order is ready, admin triggers delivery dispatch
5. System calls Shadowfax API to create delivery
6. Shadowfax returns delivery_id and estimated pickup/drop
7. Shadowfax assigns rider → webhook updates status
8. Rider picks up → webhook updates status
9. Rider out for delivery → webhook updates status
10. Rider delivers → webhook updates status; order marked DELIVERED
```

#### 5.5.3 Status Mapping

| Shadowfax Status | Internal Status |
|-----------------|-----------------|
| `pending` | DELIVERY_REQUESTED |
| `rider_assigned` | RIDER_ASSIGNED |
| `picked_up` | PICKED_UP |
| `out_for_delivery` | OUT_FOR_DELIVERY |
| `delivered` | DELIVERED |
| `cancelled` / `failed` | Order flagged for manual review |

#### 5.5.4 Data Tracked

| Field | Description |
|-------|-------------|
| Provider delivery ID | Shadowfax's delivery identifier |
| Tracking ID | Customer-facing tracking reference |
| Rider name & phone | Assigned rider details |
| Rider location | Real-time lat/lng (when available) |
| Quoted charge | Estimated delivery cost |
| Final charge | Actual delivery cost after completion |
| ETA | Estimated pickup and delivery times |
| Raw payload | Full provider response for debugging |
| Webhook history | All received webhook events |

#### 5.5.5 Mock Mode

When `SHADOWFAX_API_KEY` is not configured, the system uses a mock adapter that simulates all API responses. This allows full development and testing without Shadowfax credentials.

---

### 5.6 Security & Compliance

| Requirement | Implementation |
|-------------|----------------|
| Server-side auth | JWT-based session tokens with HttpOnly cookies |
| Password hashing | bcrypt for admin passwords (when password auth is implemented) |
| CSRF protection | Cookie-based CSRF tokens on state-changing requests |
| Rate limiting | Applied to sensitive endpoints (login, payment, webhooks) |
| Input validation | zod schemas on all tRPC inputs |
| SQL injection prevention | Drizzle ORM parameterized queries |
| Webhook signature verification | HMAC verification for Razorpay and Shadowfax webhooks |
| Secrets management | AES-256-GCM encrypted vault for integration credentials |
| No frontend secrets | Razorpay Key ID only (not Key Secret); all other secrets server-side only |
| No trusted client totals | All pricing recalculated server-side at checkout |
| Audit logging | Every admin action logged with actor, action, target, before/after data |
| Secure headers | Helmet middleware for HTTP security headers |
| HTTPS enforced | Nginx reverse proxy with Let's Encrypt SSL |

---

## 6. Information Architecture

### Customer Storefront

```
/
├── / (Homepage)
│   ├── Location selector
│   ├── Promotional banners
│   ├── Category carousel
│   ├── Featured items
│   └── Search bar
├── /search?q=...
│   └── Search results with filters
├── /cart
│   ├── Item list with quantities
│   ├── Coupon input
│   └── Price breakdown
├── /checkout
│   ├── Address selection/form
│   ├── Order summary
│   └── Payment
├── /orders/:id
│   └── Order tracking with timeline
└── /admin
    ├── /admin (Dashboard)
    ├── /admin/orders (Order management)
    ├── /admin/menu (Menu CRUD)
    ├── /admin/import (Bulk import)
    ├── /admin/coupons (Coupon management)
    ├── /admin/customers (Customer management)
    ├── /admin/reports (Analytics)
    ├── /admin/restaurant (Restaurant settings)
    └── /admin/integrations (Razorpay, Shadowfax)
```

### Admin Navigation Structure

```
Admin Sidebar:
├── Kitchen Status Card (ON/OFF toggle)
├── Overview (Dashboard)
├── Orders (Pipeline + Order details)
├── Menu (Categories + Items)
├── Import Menu (CSV upload)
├── Coupons (CRUD)
├── Customers (List + Detail)
├── Reports (Analytics + Export)
├── Restaurant (Settings)
└── Integrations (Razorpay + Shadowfax)
```

---

## 7. Data Model

### Entity Relationship Summary

```
Restaurants (1) ──── (N) Outlets
Restaurants (1) ──── (N) MenuCategories
Restaurants (1) ──── (N) MenuItems
MenuCategories (1) ── (N) MenuItems
MenuItems (1) ────── (N) ProductVariants
MenuItems (1) ────── (N) AddonGroups
AddonGroups (1) ──── (N) AddonOptions
MenuItems (1) ────── (N) MenuItemImages

Customers (1) ────── (N) CustomerAddresses
Customers (1) ────── (N) Carts
Carts (1) ────────── (N) CartItems

Orders (1) ───────── (N) OrderItems
Orders (1) ───────── (N) OrderStatusHistory
Orders (1) ───────── (1) Payments
Payments (1) ─────── (N) Refunds
Orders (1) ───────── (1) Deliveries
Deliveries (1) ───── (N) DeliveryStatusHistory

Customers (1) ────── (N) CouponUsage
Coupons (1) ──────── (N) CouponUsage

Users (1) ────────── (N) AdminUserRoles
AdminRoles (1) ──── (N) AdminRolePermissions
Users (1) ────────── (N) AuditLogs
```

### Database Tables (34 tables)

| Table | Purpose |
|-------|---------|
| `users` | All users (admin + customer) |
| `admin_roles` | RBAC roles (Super Admin, Kitchen Manager, etc.) |
| `admin_role_permissions` | Granular permission strings per role |
| `admin_user_roles` | Role assignments to users |
| `customer_profiles` | Customer-specific data (spending stats, admin notes) |
| `customer_addresses` | Saved delivery addresses with labels |
| `restaurants` | Restaurant/brand configuration |
| `restaurant_schedules` | Per-day-of-week opening hours |
| `outlets` | Physical kitchen locations |
| `outlet_schedules` | Per-day-of-week outlet hours |
| `menu_categories` | Food categories (Starters, Mains, etc.) |
| `category_schedules` | Time-based category availability |
| `menu_items` | Individual food products |
| `menu_item_images` | Gallery images per item |
| `product_schedules` | Time-based item availability |
| `product_variants` | Size/variant options with pricing |
| `addon_groups` | Modifier groups (e.g., "Extra Toppings") |
| `addon_options` | Individual modifier options with pricing |
| `carts` | Shopping cart per customer/session |
| `cart_items` | Items in cart with variants and modifiers |
| `orders` | Complete order records |
| `order_items` | Line items per order with snapshots |
| `order_status_history` | Status change timeline |
| `payments` | Razorpay payment records |
| `refunds` | Refund records with status |
| `deliveries` | Shadowfax delivery records |
| `delivery_status_history` | Delivery status timeline |
| `coupons` | Coupon definitions |
| `coupon_usage` | Coupon redemption tracking |
| `webhook_events` | Idempotent webhook processing |
| `import_jobs` | Bulk import tracking |
| `audit_logs` | Admin action audit trail |
| `settings` | Key-value configuration store |
| `integration_secrets` | Encrypted API credentials |

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Integer paise for all money | Avoids floating-point currency errors (₹199.00 = 19900 paise) |
| Enum types for statuses | Type-safe, constrained values prevent invalid states |
| JSONB for modifier snapshots | Order items store a snapshot of selected modifiers at time of order |
| JSONB for address snapshots | Order stores address snapshot so changes to customer addresses don't affect historical orders |
| Separate schedule tables | Flexible scheduling rules without schema changes |
| Audit log with before/after JSONB | Complete change history for compliance and debugging |
| Encrypted integration secrets | AES-256-GCM encryption; secrets never stored in plaintext |

---

## 8. Order Lifecycle

### State Diagram

```
                        ┌─────────────────┐
                        │ PENDING_PAYMENT  │
                        └────────┬────────┘
                    ┌────────────┼────────────┐
                    ▼            │            ▼
            ┌───────────────┐   │   ┌──────────────┐
            │PAYMENT_FAILED │   │   │  CANCELLED    │
            └───────────────┘   │   └──────────────┘
                                ▼
                    ┌───────────────────────┐
                    │  PAYMENT_CONFIRMED /   │
                    │       PLACED          │
                    └───────────┬───────────┘
                ┌───────────────┼───────────────┐
                ▼               │               ▼
        ┌──────────────┐       │       ┌──────────────┐
        │   REJECTED   │       │       │  CANCELLED    │
        └──────────────┘       │       └──────────────┘
                               ▼
                    ┌───────────────────────┐
                    │  RESTAURANT_ACCEPTED   │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │      PREPARING        │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │   READY_FOR_PICKUP    │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │  DELIVERY_REQUESTED    │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │    RIDER_ASSIGNED      │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │      PICKED_UP        │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │   OUT_FOR_DELIVERY    │
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │      DELIVERED        │
                    └───────────┬───────────┘
                    ┌───────────┼───────────┐
                    ▼           │           ▼
            ┌──────────────┐   │   ┌──────────────┐
            │REFUND_PENDING│   │   │   (Final)     │
            └──────┬───────┘   │   └──────────────┘
                   ▼           │
            ┌──────────────┐   │
            │   REFUNDED   │   │
            └──────────────┘   │
```

### Allowed Transitions

| From State | Allowed To States |
|-----------|-------------------|
| PENDING_PAYMENT | PAYMENT_CONFIRMED, PAYMENT_FAILED, CANCELLED |
| PAYMENT_CONFIRMED | PLACED, CANCELLED |
| PLACED | RESTAURANT_ACCEPTED, REJECTED, CANCELLED |
| RESTAURANT_ACCEPTED | PREPARING, CANCELLED |
| PREPARING | READY_FOR_PICKUP, CANCELLED |
| READY_FOR_PICKUP | DELIVERY_REQUESTED, CANCELLED |
| DELIVERY_REQUESTED | RIDER_ASSIGNED, CANCELLED |
| RIDER_ASSIGNED | PICKED_UP |
| PICKED_UP | OUT_FOR_DELIVERY |
| OUT_FOR_DELIVERY | DELIVERED |
| DELIVERED | REFUND_PENDING |
| REJECTED | REFUND_PENDING |
| CANCELLED | REFUND_PENDING |
| REFUND_PENDING | REFUNDED |
| REFUNDED | *(terminal)* |
| PAYMENT_FAILED | *(terminal)* |
| DELIVERED | *(terminal, unless refund)* |

---

## 9. Payment Flow

### Sequence Diagram

```
Customer         Frontend          Backend           Razorpay
   │                │                 │                  │
   │── Checkout ──▶│                 │                  │
   │                │── Create ──────▶│                  │
   │                │   Order         │                  │
   │                │                 │── Create ───────▶│
   │                │                 │   Order          │
   │                │                 │◀── Order ID ─────│
   │                │◀─ {keyId, ─────│                  │
   │                │   orderId }    │                  │
   │── Pay ────────▶│                │                  │
   │                │── Open ───────────────────────────▶│
   │                │   Checkout      │                  │
   │                │                 │                  │
   │◀── Complete ───│◀──────────────────────────────────│
   │   Payment      │                │                  │
   │                │── Verify ──────▶│                  │
   │                │   Signature     │── Verify ───────▶│
   │                │                 │◀── Valid ────────│
   │                │◀─ Success ─────│                  │
   │◀─ Order ──────│                │                  │
   │   Confirmed    │                │                  │
```

### Webhook Flow

```
Razorpay          Backend            Database
   │                │                  │
   │── POST ───────▶│                  │
   │   webhook      │── Verify HMAC ──▶│
   │                │── Check idempotency │
   │                │   (webhook_events)  │
   │                │◀─ New event ────│
   │                │── Process ─────▶│
   │                │   (update order, │
   │                │    payment, refund)│
   │                │── Mark processed▶│
   │◀─ 200 OK ─────│                  │
```

---

## 10. Delivery Flow

### Sequence Diagram

```
Kitchen Staff       Backend          Shadowfax         Customer
    │                  │                 │                 │
    │── Mark Ready ───▶│                 │                 │
    │                  │── Create ──────▶│                 │
    │                  │   Delivery      │                 │
    │                  │◀─ delivery_id ─│                 │
    │                  │                 │                 │
    │                  │◀── Webhook ─────│                 │
    │                  │   (rider assigned)               │
    │                  │── Update ──────▶│                 │
    │                  │                 │── Notify ──────▶│
    │                  │                 │   (rider info)  │
    │                  │                 │                 │
    │                  │◀── Webhook ─────│                 │
    │                  │   (picked up)   │                 │
    │                  │── Update ──────▶│                 │
    │                  │                 │── Update ──────▶│
    │                  │                 │   (tracking)    │
    │                  │                 │                 │
    │                  │◀── Webhook ─────│                 │
    │                  │   (delivered)   │                 │
    │                  │── Update ──────▶│                 │
    │                  │── Mark order ──▶│                 │
    │                  │   DELIVERED     │── Notify ──────▶│
    │                  │                 │   (delivered)   │
```

---

## 11. Business Rules

### Restaurant Availability

| Rule | Description |
|------|-------------|
| Manual OFF | Immediately prevents all new orders; existing orders continue |
| Scheduled hours | Per-day-of-week open/close times; cross-midnight supported |
| Temporary closure | Start/end datetime with customer-facing message |
| Overrides | Manual toggle takes precedence over schedule |

### Menu Availability

| Rule | Description |
|------|-------------|
| Category schedule | Category visible only during its scheduled hours |
| Item schedule | Item available only during its scheduled hours |
| Item toggle | Large visible ON/OFF switch per item |
| Stock tracking | Item auto-disables when stock reaches 0 |
| Max quantity | Per-item maximum quantity per order |

### Cart Rules

| Rule | Description |
|------|-------------|
| Single restaurant | Cart restricted to one restaurant at a time |
| Min order check | Reject checkout if total < restaurant minimum order |
| Real-time validation | Re-check all item availability and prices at checkout |
| Stock validation | Ensure stock > requested quantity at checkout |

### Coupon Rules

| Rule | Description |
|------|-------------|
| Server-side validation | All coupon checks done server-side |
| Date range | Coupon only valid between startsAt and endsAt |
| Usage limits | Global total_usage_limit and per-customer per_customer_limit |
| Minimum order | Cart must meet min_order_paise to apply |
| Max discount cap | Percentage coupons capped at max_discount_paise |
| New customer only | First-time customer restriction |
| Single coupon | Only one coupon per order |

### Pricing Rules

| Rule | Description |
|------|-------------|
| Integer arithmetic | All monetary values in paise (integer) |
| Server-side calculation | Frontend displays prices; backend calculates totals |
| Tax calculation | Applied to item subtotal before discounts |
| Packaging fee | Per-restaurant and per-item packaging fees |
| Delivery fee | Per-restaurant delivery fee |

---

## 12. Technical Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Nginx (443)                        │
│              SSL Termination + Rate Limiting           │
│                   9housekitchen.in                     │
└─────────────┬───────────────────────────────────────┘
              │ proxy_pass to 127.0.0.1:4300
              ▼
┌─────────────────────────────────────────────────────┐
│              Node.js App (Port 4300)                  │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │  Express    │  │   tRPC     │  │  React SPA   │  │
│  │  Server     │  │  Router    │  │  (built)     │  │
│  └──────┬─────┘  └─────┬──────┘  └──────────────┘  │
│         │               │                             │
│  ┌──────┴───────────────┴──────┐                     │
│  │       Business Logic         │                     │
│  │  ┌──────────┐ ┌──────────┐  │                     │
│  │  │Scheduling│ │Pricing   │  │                     │
│  │  │Engine    │ │Engine    │  │                     │
│  │  └──────────┘ └──────────┘  │                     │
│  │  ┌──────────┐ ┌──────────┐  │                     │
│  │  │Availab-  │ │Order     │  │                     │
│  │  │ility     │ │State     │  │                     │
│  │  │Service   │ │Machine   │  │                     │
│  │  └──────────┘ └──────────┘  │                     │
│  │  ┌────────────────────────┐ │                     │
│  │  │    Integrations         │ │                     │
│  │  │ ┌────────┐ ┌────────┐  │ │                     │
│  │  │ │Razorpay│ │Shadowfax│ │ │                     │
│  │  │ └────────┘ └────────┘  │ │                     │
│  │  └────────────────────────┘ │                     │
│  └─────────────────────────────┘                     │
│                                                       │
│  ┌─────────────────────────────┐                     │
│  │   Drizzle ORM + PostgreSQL  │                     │
│  └──────────────┬──────────────┘                     │
└─────────────────┼───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         PostgreSQL 16 (Docker)           │
│        Port 5432 (internal only)        │
│         34 tables, 15 enums             │
└─────────────────────────────────────────┘

External Services:
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Razorpay   │  │  Shadowfax   │  │     S3       │
│   (Payments) │  │  (Delivery)  │  │   (Images)   │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 19.x |
| Bundler | Vite | 6.x |
| Styling | Tailwind CSS | 4.x |
| UI Components | shadcn/ui | Latest |
| Backend | Express | 4.x |
| API | tRPC | 11.x |
| ORM | Drizzle | Latest |
| Database | PostgreSQL | 16 |
| Auth | JWT + Cookies | - |
| Payments | Razorpay SDK | Latest |
| Delivery | Shadowfax REST API | - |
| Testing | Vitest | Latest |
| Deployment | Docker + Nginx | - |
| Package Manager | pnpm | 9.x |

### Monorepo Structure

```
/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route-level pages (Home, Admin)
│   │   ├── lib/         # API clients, utilities
│   │   ├── hooks/       # Custom React hooks
│   │   └── contexts/    # React context providers
│   └── ...
├── server/              # Express backend
│   ├── _core/           # Server setup, auth, context, middleware
│   ├── domain/          # Business logic services
│   ├── routers/         # tRPC route definitions
│   ├── integrations/    # External service adapters
│   ├── auth/            # Authentication helpers
│   └── security/        # Encryption, secret vault
├── shared/              # Shared types, constants, errors
├── drizzle/             # Database schema and migrations
├── deploy/              # Docker, nginx, deployment scripts
└── docs/                # Documentation (this PRD)
```

---

## 13. Non-Functional Requirements

### Performance

| Requirement | Target |
|-------------|--------|
| First Contentful Paint | < 2s on 4G mobile |
| Largest Contentful Paint | < 3s on 4G mobile |
| Time to Interactive | < 4s on 4G mobile |
| API response time (p95) | < 500ms |
| Menu page load | < 1s (with cached restaurant data) |
| Search response | < 300ms |

### Scalability

| Metric | Target |
|--------|--------|
| Concurrent users | 500+ without degradation |
| Orders per hour | 200+ per restaurant |
| Menu items | 500+ per restaurant |
| Database connections | Connection pooling via pg |

### Reliability

| Requirement | Description |
|-------------|-------------|
| Uptime | 99.9% (8.76 hours downtime/year) |
| Data durability | PostgreSQL with persistent Docker volume |
| Backup | Daily database dumps |
| Graceful degradation | If Shadowfax is down, orders still process; delivery manually assigned |
| Idempotent webhooks | Duplicate events safely ignored |

### Security

| Requirement | Implementation |
|-------------|----------------|
| HTTPS only | Nginx with Let's Encrypt SSL; HTTP → HTTPS redirect |
| Secure cookies | HttpOnly, Secure, SameSite=Strict |
| Rate limiting | Nginx-level rate limiting on API endpoints |
| Input sanitization | zod validation on all inputs |
| SQL injection | Drizzle ORM parameterized queries |
| XSS prevention | React auto-escaping + Content Security Policy headers |
| Secret management | AES-256-GCM encrypted vault; env vars for root secrets |

### Accessibility

| Requirement | Description |
|-------------|-------------|
| WCAG 2.1 AA | Target compliance for core flows |
| Color contrast | 4.5:1 minimum for text |
| Keyboard navigation | All interactive elements focusable |
| Screen reader | Semantic HTML, ARIA labels on icons |
| Touch targets | Minimum 44×44px on mobile |

---

## 14. Deployment & Infrastructure

### Production Environment

| Component | Specification |
|-----------|--------------|
| **VPS Provider** | User's existing VPS |
| **Domain** | 9housekitchen.in |
| **Web Server** | Nginx (host-level) with SSL via Let's Encrypt |
| **App Runtime** | Node.js 18+ in Docker container |
| **Database** | PostgreSQL 16 in Docker container |
| **Storage** | Docker volume for PostgreSQL data |
| **SSL** | Let's Encrypt auto-renewal via certbot |
| **Process Management** | Docker Compose with `restart: unless-stopped` |

### Deployment Commands

```bash
# Clone and deploy
git clone https://github.com/alpesh15gb/Food.git /opt/cloudkitchen
cd /opt/cloudkitchen
sudo bash deploy/deploy.sh

# Update after code changes
cd /opt/cloudkitchen
git pull origin main
docker compose -f deploy/docker-compose.yml --env-file deploy/config.env up -d --build app
```

### Nginx Configuration

| Setting | Value |
|---------|-------|
| Listen | 80 (HTTP), 443 (HTTPS) |
| Proxy target | 127.0.0.1:4300 |
| Rate limit | 30 req/s general, 5 req/s auth endpoints |
| Security headers | X-Frame-Options, CSP, HSTS, etc. |
| SSL | Let's Encrypt with auto-renewal |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Session signing key (64+ chars) |
| `COOKIE_SECRET` | Yes | Cookie encryption key |
| `SECRET_ENCRYPTION_KEY` | Yes | 32-byte hex for AES-256-GCM vault |
| `LOCAL_ADMIN_TOKEN` | Yes | Admin login passphrase |
| `RAZORPAY_KEY_ID` | For payments | Razorpay publishable key |
| `RAZORPAY_KEY_SECRET` | For payments | Razorpay secret key |
| `RAZORPAY_WEBHOOK_SECRET` | For payments | Razorpay webhook HMAC secret |
| `SHADOWFAX_API_KEY` | For delivery | Shadowfax API key |
| `SHADOWFAX_MERCHANT_ID` | For delivery | Shadowfax merchant ID |
| `SHADOWFAX_WEBHOOK_SECRET` | For delivery | Shadowfax webhook HMAC secret |

---

## 15. Testing Strategy

### Test Coverage

| Module | Tests | What's Covered |
|--------|-------|---------------|
| `orderPricing.test.ts` | 17 | Pricing calculations, coupon validation, stock checks, tax computation |
| `scheduling.test.ts` | 20 | Cross-midnight schedules, weekday rules, date ranges, temporary closures |
| `orderStateMachine.test.ts` | 22 | All state transitions, invalid transition rejection, payment status mapping |
| `availability.test.ts` | 14 | Full hierarchy (restaurant → outlet → category → item), schedule checks |
| `webhookIdempotency.test.ts` | 2 | Duplicate event detection and safe handling |
| `menuImport.test.ts` | 2 | CSV parsing, validation, error reporting |
| `auth.logout.test.ts` | 1 | Session clearing |
| **Total** | **78** | **All passing** |

### Test Categories

| Category | Priority | Description |
|----------|----------|-------------|
| Unit tests | P0 | Pure business logic functions (pricing, scheduling, state machine) |
| Integration tests | P1 | API endpoint tests with mocked database |
| E2E tests | P2 | Full user flows (browse → cart → checkout → payment) |
| Load tests | P2 | Peak-hour order volume simulation |

### What Needs Additional Testing

| Area | Status | Notes |
|------|--------|-------|
| Razorpay signature verification | Mocked in tests | Needs integration test with Razorpay test mode |
| Shadowfax webhook processing | Mocked in tests | Needs integration test with Shadowfax sandbox |
| Database queries | Not unit tested | Covered by integration tests |
| Admin panel UI | Not tested | Candidate for Playwright/Cypress E2E |
| Storefront UI | Not tested | Candidate for Playwright/Cypress E2E |

---

## 16. Success Metrics

### Key Performance Indicators (KPIs)

| Metric | Target (Month 1) | Target (Month 3) |
|--------|------------------|------------------|
| Daily orders | 20+ | 80+ |
| Average order value | ₹350 | ₹400 |
| Customer retention (30-day) | 20% | 35% |
| Order completion rate | 90% | 95% |
| Average delivery time | < 45 min | < 35 min |
| Payment success rate | 95% | 98% |
| Admin panel daily active users | 2 | 4 |
| Menu items available | 35+ | 50+ |
| Customer NPS | 30+ | 50+ |

### Business Metrics

| Metric | Target |
|--------|--------|
| Commission savings vs Swiggy/Zomato | 15-25% per order |
| Direct order percentage | 30% of total orders in 6 months |
| Customer data ownership | 100% of direct order customers |
| Average customer lifetime value | ₹3,000+ |

---

## 17. Launch Checklist

### Pre-Launch (Must Complete)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | PostgreSQL database running in Docker | DevOps | ✅ Done |
| 2 | Schema pushed (34 tables) | DevOps | ✅ Done |
| 3 | Seed data loaded (35 dishes, categories, outlets) | DevOps | ✅ Done |
| 4 | Nginx configured with SSL | DevOps | ✅ Done |
| 5 | App deployed and serving on 9housekitchen.in | DevOps | ✅ Done |
| 6 | Razorpay LIVE keys configured | Owner | ⬜ Pending |
| 7 | Razorpay webhook URL configured | Owner | ⬜ Pending |
| 8 | Real food photography uploaded | Owner | ⬜ Pending |
| 9 | Restaurant hours configured correctly | Owner | ⬜ Pending |
| 10 | Delivery area/pincode configured | Owner | ⬜ Pending |
| 11 | Test order placed end-to-end | Owner | ⬜ Pending |
| 12 | Payment tested with Razorpay test mode | Owner | ⬜ Pending |

### Post-Launch (Week 1)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 13 | Shadowfax merchant registration | Owner | ⬜ Pending |
| 14 | Shadowfax credentials configured | Owner | ⬜ Pending |
| 15 | First live delivery test | Owner | ⬜ Pending |
| 16 | Admin team trained on order management | Owner | ⬜ Pending |
| 17 | Customer feedback collection setup | Owner | ⬜ Pending |
| 18 | Database backup schedule configured | DevOps | ⬜ Pending |
| 19 | Monitoring/alerting configured | DevOps | ⬜ Pending |
| 20 | Google Analytics / tracking installed | Owner | ⬜ Pending |

### Post-Launch (Month 1)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 21 | First coupon/promotion campaign | Owner | ⬜ Pending |
| 22 | Customer retention program designed | Owner | ⬜ Pending |
| 23 | Reporting reviewed and decisions made | Owner | ⬜ Pending |
| 24 | Performance optimization based on real data | DevOps | ⬜ Pending |
| 25 | Mobile app consideration (PWA or native) | Owner | ⬜ Pending |

---

## 18. Future Roadmap

### Release A — Onboard & Publish (Current + 2 weeks)
- ✅ Database schema and migrations
- ✅ Scheduling engine
- ✅ Order state machine
- ✅ Razorpay integration (TEST mode)
- ✅ Shadowfax adapter (MOCK mode)
- ✅ Basic admin panel
- ⬜ Menu import wizard with preview
- ⬜ Mobile admin navigation improvements
- ⬜ Integration setup checklist UI

### Release B — Transact & Fulfill (Month 1-2)
- ⬜ Razorpay LIVE mode activation
- ⬜ Shadowfax LIVE mode activation
- ⬜ OTP-based customer authentication
- ⬜ Address book with saved addresses
- ⬜ Delivery serviceability validation
- ⬜ Real-time order notifications
- ⬜ Kitchen Display System (KDS) view
- ⬜ Printable/WhatsApp receipts

### Release C — Operate & Learn (Month 2-3)
- ⬜ Reporting dashboard with charts (recharts)
- ⬜ Customer management page
- ⬜ Bulk import with XLSX support and progress tracking
- ⬜ Export reports as CSV/XLSX
- ⬜ Audit log viewer
- ⬜ Role-based access control UI
- ⬜ Restaurant scheduling UI
- ⬜ Serviceability configuration UI

### Release D — Optimise & Scale (Month 3-6)
- ⬜ Multi-outlet support in UX
- ⬜ Multi-brand support
- ⬜ Ingredient/recipe inventory
- ⬜ CRM and loyalty programs
- ⬜ WhatsApp order notifications
- ⬜ Customer feedback/rating system
- ⬜ A/B testing for promotions
- ⬜ Mobile app (React Native or PWA)
- ⬜ Dine-in / QR ordering (POS)
- ⬜ Advanced analytics (cohort analysis, RFM)

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **Paise** | Indian sub-currency unit; ₹1 = 100 paise. All monetary values stored as integer paise. |
| **AOV** | Average Order Value — total revenue / number of orders |
| **CLV** | Customer Lifetime Value — total revenue from a customer over their lifetime |
| **KDS** | Kitchen Display System — screen showing incoming orders for kitchen staff |
| **RBAC** | Role-Based Access Control — permissions assigned via roles |
| **tRPC** | TypeScript RPC framework for type-safe API calls |
| **Drizzle** | TypeScript ORM for SQL databases |
| **Shadowfax** | Indian hyperlocal delivery service provider |
| **Razorpay** | Indian payment gateway supporting UPI, cards, netbanking, wallets |

## Appendix B: API Endpoints Summary

### Storefront API (tRPC)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `storefront.getRestaurant` | Query | Get restaurant info and config |
| `storefront.getMenu` | Query | Get categories and items for an outlet |
| `storefront.searchItems` | Query | Search menu with filters |
| `storefront.checkAvailability` | Query | Check if items/restaurant are available |
| `storefront.checkServiceability` | Query | Check if address is in delivery zone |
| `storefront.applyCoupon` | Mutation | Validate and apply coupon to cart |
| `storefront.createOrder` | Mutation | Create order with Razorpay payment |
| `storefront.verifyPayment` | Mutation | Verify Razorpay payment signature |
| `storefront.getOrder` | Query | Get order details and status |
| `storefront.getOrderTimeline` | Query | Get order status history |
| `storefront.razorpayWebhook` | Webhook | Handle Razorpay payment events |
| `storefront.shadowfaxWebhook` | Webhook | Handle Shadowfax delivery events |

### Admin API (tRPC)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `admin.getDashboard` | Query | Get dashboard metrics |
| `admin.getOrders` | Query | List orders with filters |
| `admin.getOrderDetail` | Query | Get full order details |
| `admin.updateOrderStatus` | Mutation | Accept/reject/prepare/ready/cancel |
| `admin.initiateRefund` | Mutation | Process refund via Razorpay |
| `admin.getCategories` | Query | List categories |
| `admin.createCategory` | Mutation | Create new category |
| `admin.updateCategory` | Mutation | Update category |
| `admin.getMenuItems` | Query | List menu items |
| `admin.createMenuItem` | Mutation | Create new item |
| `admin.updateMenuItem` | Mutation | Update item |
| `admin.toggleItemAvailability` | Mutation | ON/OFF toggle |
| `admin.exportMenu` | Query | Export menu as CSV |
| `admin.importMenu` | Mutation | Import menu from CSV |
| `admin.getCoupons` | Query | List coupons |
| `admin.createCoupon` | Mutation | Create new coupon |
| `admin.updateCoupon` | Mutation | Update coupon |
| `admin.getCustomers` | Query | List customers with stats |
| `admin.getCustomerDetail` | Query | Customer detail with orders |
| `admin.getReports` | Query | Generate reports |
| `admin.getRestaurantSettings` | Query | Get restaurant config |
| `admin.updateRestaurantSettings` | Mutation | Update restaurant config |
| `admin.getAuditLogs` | Query | View admin action history |
| `admin.getIntegrationStatus` | Query | Check integration config status |
| `admin.updateIntegration` | Mutation | Configure integration credentials |

---

*Document generated for 9House Kitchen — Cloud-Kitchen Ordering Platform*  
*Architecture: React 19 + Express + tRPC + PostgreSQL + Drizzle ORM*  
*Deployment: Docker + Nginx on 9housekitchen.in*
