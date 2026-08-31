# API Documentation — 9House Kitchen Platform

**Version:** 1.0  
**Date:** August 31, 2026  
**Base URL:** `https://9housekitchen.in/api/trpc`  
**Protocol:** tRPC v11 over HTTP  
**Auth:** HttpOnly session cookie (`app_session_id`)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Error Handling](#2-error-handling)
3. [System Router](#3-system-router)
4. [Auth Router](#4-auth-router)
5. [Storefront Router (Public)](#5-storefront-router-public)
6. [Admin Router (Protected)](#6-admin-router-protected)
7. [Webhook Endpoints](#7-webhook-endpoints)
8. [Data Types & Enums](#8-data-types--enums)
9. [Webhook Signatures](#9-webhook-signatures)
10. [Rate Limiting](#10-rate-limiting)

---

## 1. Authentication

### Session Management

| Mechanism | Details |
|-----------|---------|
| Cookie name | `app_session_id` |
| Cookie type | HttpOnly, Secure, SameSite=Strict |
| Token format | JWT signed with `JWT_SECRET` |
| Session duration | 12 hours |
| Signing | HMAC-SHA256 via SDK `signSession()` |

### Admin Login Flow

```
1. Client checks: auth.localAdminEnabled → true if LOCAL_ADMIN_TOKEN + JWT_SECRET are set
2. Client sends: auth.localAdminLogin({ token: "<passphrase>" })
3. Server validates with timing-safe comparison
4. Server creates/updates user record with role: "admin"
5. Server signs JWT and sets HttpOnly cookie
6. Client reloads page — subsequent requests include session cookie
7. All admin.* endpoints check ctx.user.role === "admin"
```

### Client Usage (tRPC)

```typescript
import { trpc } from "@/lib/trpc";

// Check if local admin login is available
const { data: localAccess } = trpc.auth.localAdminEnabled.useQuery();

// Login
const login = trpc.auth.localAdminLogin.useMutation({
  onSuccess: () => window.location.reload(),
});
login.mutate({ token: "your-admin-passphrase" });

// Check current user
const { data: user } = trpc.auth.me.useQuery();

// Logout
const logout = trpc.auth.logout.useMutation({
  onSuccess: () => window.location.reload(),
});
```

---

## 2. Error Handling

### tRPC Error Format

All errors follow tRPC's standard error format:

```json
{
  "error": {
    "message": "Error message",
    "code": "BAD_REQUEST",
    "data": {
      "code": "BAD_REQUEST",
      "httpStatus": 400,
      "path": "admin.updateOrderStatus",
      "stack": "..."
    }
  }
}
```

### Error Codes

| Code | HTTP Status | When |
|------|------------|------|
| `BAD_REQUEST` | 400 | Invalid input, validation failure |
| `UNAUTHORIZED` | 401 | Missing or invalid session cookie |
| `FORBIDDEN` | 403 | Valid session but insufficient role (non-admin) |
| `NOT_FOUND` | 404 | Resource not found (restaurant, order, etc.) |
| `TIMEOUT` | 408 | Request timeout |
| `CONFLICT` | 409 | Duplicate resource (e.g., duplicate coupon code) |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

### Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| `Please login (10001)` | No session cookie or expired | Re-authenticate |
| `You do not have required permission (10002)` | User is not admin | Check user role |
| `The administrator passphrase was not accepted.` | Wrong admin token | Verify LOCAL_ADMIN_TOKEN |
| `Online payment is not configured yet.` | Razorpay keys not set | Configure in Integrations |
| `Database unavailable` | PostgreSQL connection failed | Check database container |

---

## 3. System Router

### `system.health`

Health check endpoint. No authentication required.

**Type:** `query` (public)  
**Procedure:** `system.health`

**Request:** None

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-08-31T12:00:00.000Z",
  "version": "1.0.0"
}
```

**Example:**
```bash
curl https://9housekitchen.in/api/trpc/system.health
```

---

## 4. Auth Router

### `auth.me`

Returns the currently authenticated user or `null`.

**Type:** `query` (public)  
**Procedure:** `auth.me`

**Request:** None

**Response:**
```json
{
  "id": 1,
  "openId": "vps-local-administrator",
  "name": "Kitchen Administrator",
  "email": null,
  "mobile": null,
  "role": "admin",
  "createdAt": "2026-08-31T10:00:00.000Z",
  "lastSignedIn": "2026-08-31T12:00:00.000Z"
}
```

If not authenticated:
```json
null
```

---

### `auth.localAdminEnabled`

Checks if local admin login is available (based on environment variables).

**Type:** `query` (public)  
**Procedure:** `auth.localAdminEnabled`

**Request:** None

**Response:**
```json
true
```

Returns `true` if both `LOCAL_ADMIN_TOKEN` and `JWT_SECRET` environment variables are set.

---

### `auth.localAdminLogin`

Authenticates an administrator using a passphrase.

**Type:** `mutation` (public)  
**Procedure:** `auth.localAdminLogin`

**Input Schema:**
```typescript
{
  token: string;  // max 4096 chars
}
```

**Request Example:**
```json
{
  "token": "your-admin-passphrase-at-least-16-chars"
}
```

**Response (success):**
```json
{
  "success": true
}
```

**Side effects:**
- Sets `app_session_id` HttpOnly cookie (12-hour expiry)
- Creates/updates user record in database
- Audit-logs the login

**Errors:**
| Error | Cause |
|-------|-------|
| `The administrator passphrase was not accepted.` | Token doesn't match LOCAL_ADMIN_TOKEN |

---

### `auth.logout`

Clears the session cookie.

**Type:** `mutation` (public)  
**Procedure:** `auth.logout`

**Request:** None

**Response:**
```json
{
  "success": true
}
```

**Side effects:**
- Clears `app_session_id` cookie

---

## 5. Storefront Router (Public)

All storefront endpoints are publicly accessible (no authentication required) except `initiatePayment` and `verifyPayment` which require an active session.

### `storefront.get`

Returns complete restaurant data including categories, menu items, offers, and configuration.

**Type:** `query` (public)  
**Procedure:** `storefront.get`

**Input Schema:**
```typescript
{
  slug: string;  // min 2 chars, e.g., "spice-garden"
}
```

**Request Example:**
```json
{
  "slug": "spice-garden"
}
```

**Response:**
```json
{
  "restaurant": {
    "id": "rest_abc123",
    "slug": "spice-garden",
    "name": "Spice Garden",
    "description": "Authentic North Indian cuisine...",
    "cuisineSummary": "Indian • Biryani • Kebabs",
    "logoUrl": "/assets/logo.png",
    "bannerImageUrl": "/assets/banner.jpg",
    "primaryColor": "#C84630",
    "secondaryColor": "#F7E4D3",
    "contactPhone": "+91 98765 43210",
    "address": "123 Food Street, Bengaluru",
    "isOpen": true,
    "opensAt": "11:00 AM",
    "deliveryFeePaise": 3000,
    "packagingFeePaise": 2500,
    "minOrderPaise": 19900,
    "preparationMinutes": 25,
    "deliveryRadiusKm": "5",
    "allowScheduledOrders": true,
    "gstPercentage": "5",
    "tempClosureStart": null,
    "tempClosureEnd": null,
    "tempClosureMessage": null
  },
  "outlet": {
    "id": "outlet_xyz",
    "name": "Main Kitchen",
    "address": "123 Food Street, Bengaluru",
    "isOpen": true,
    "preparationMinutes": 25
  },
  "categories": [
    {
      "id": "cat_001",
      "name": "Biryani",
      "slug": "biryani",
      "iconEmoji": "🍛",
      "sortOrder": 1,
      "isVisible": true,
      "isOpen": true
    },
    {
      "id": "cat_002",
      "name": "Starters",
      "slug": "starters",
      "iconEmoji": "🍗",
      "sortOrder": 2,
      "isVisible": true,
      "isOpen": true
    }
  ],
  "items": [
    {
      "id": "item_001",
      "categoryId": "cat_001",
      "name": "Chicken Biryani",
      "slug": "chicken-biryani",
      "description": "Aromatic basmati rice layered with tender chicken...",
      "pricePaise": 28000,
      "offerPricePaise": 25000,
      "imageUrl": "/assets/chicken-biryani.jpg",
      "dietaryType": "nonveg",
      "tag": "Bestseller",
      "isBestseller": true,
      "isFeatured": true,
      "isRecommended": false,
      "spiceLevel": 3,
      "preparationMinutes": 25,
      "availability": "AVAILABLE",
      "isCustomizable": true,
      "isOpen": true,
      "stock": null,
      "sortOrder": 1,
      "tags": ["biryani", "chicken", "rice"]
    }
  ],
  "offers": [
    {
      "id": "coupon_001",
      "code": "WELCOME50",
      "description": "₹50 off on first order",
      "discountType": "flat",
      "discountValue": 5000,
      "minOrderPaise": 19900,
      "maxDiscountPaise": 5000
    }
  ],
  "schedules": [],
  "collections": [
    {
      "name": "Bestsellers",
      "items": ["item_001", "item_005"]
    },
    {
      "name": "Recommended",
      "items": ["item_003", "item_007"]
    }
  ]
}
```

---

### `storefront.paymentConfig`

Returns Razorpay configuration status (Key ID only, never secrets).

**Type:** `query` (public)  
**Procedure:** `storefront.paymentConfig`

**Request:** None

**Response:**
```json
{
  "enabled": true,
  "keyId": "rzp_live_xxxxxxxxxxxx",
  "currency": "INR"
}
```

If Razorpay is not configured:
```json
{
  "enabled": false,
  "keyId": null,
  "currency": "INR"
}
```

---

### `storefront.search`

Search menu items across name, description, category, and tags with filters.

**Type:** `query` (public)  
**Procedure:** `storefront.search`

**Input Schema:**
```typescript
{
  slug: string;        // min 2 chars
  query: string;       // min 1, max 200 chars
  veg?: boolean;       // filter vegetarian only
  bestseller?: boolean; // filter bestsellers only
  minPrice?: number;   // min price in paise (integer)
  maxPrice?: number;   // max price in paise (integer)
}
```

**Request Example:**
```json
{
  "slug": "spice-garden",
  "query": "biryani",
  "veg": false,
  "bestseller": true,
  "minPrice": 20000,
  "maxPrice": 50000
}
```

**Response:**
```json
{
  "items": [
    {
      "id": "item_001",
      "name": "Chicken Biryani",
      "description": "Aromatic basmati rice...",
      "pricePaise": 28000,
      "offerPricePaise": 25000,
      "dietaryType": "nonveg",
      "isBestseller": true,
      "availability": "AVAILABLE",
      "categoryId": "cat_001",
      "imageUrl": "/assets/chicken-biryani.jpg",
      "tags": ["biryani", "chicken"]
    }
  ],
  "categories": [
    {
      "id": "cat_001",
      "name": "Biryani",
      "iconEmoji": "🍛"
    }
  ]
}
```

**Search Logic:**
- Text search is case-insensitive `includes()` match
- Searches across: `name`, `description`, `tag`, `category.name`, `tags[]`
- Filters are AND-combined
- Results limited to 50 items

---

### `storefront.checkServiceability`

Checks if a pincode is within the delivery zone.

**Type:** `query` (public)  
**Procedure:** `storefront.checkServiceability`

**Input Schema:**
```typescript
{
  pincode: string;  // min 4, max 10 chars
}
```

**Request Example:**
```json
{
  "pincode": "560001"
}
```

**Response:**
```json
{
  "serviceable": true,
  "estimatedDeliveryMinutes": 35,
  "deliveryFeePaise": 3000,
  "message": null
}
```

If not serviceable:
```json
{
  "serviceable": false,
  "estimatedDeliveryMinutes": null,
  "deliveryFeePaise": null,
  "message": "Delivery not available in this area"
}
```

---

### `storefront.initiatePayment`

Creates an internal order and Razorpay payment order. Requires authentication.

**Type:** `mutation` (protected — requires session)  
**Procedure:** `storefront.initiatePayment`

**Input Schema:**
```typescript
{
  slug: string;          // restaurant slug
  lines: Array<{         // min 1 item
    menuItemId: string;  // min 3 chars
    quantity: number;    // integer, 1-20
    modifiers?: Array<{
      optionId: string;
      name: string;
      pricePaise: number;  // integer, >= 0
    }>;
    specialInstructions?: string;  // max 300 chars
  }>;
  address: {             // delivery address
    flatHouse: string;   // required
    building?: string;
    street?: string;
    landmark?: string;
    area: string;        // required
    city: string;        // required
    postalCode?: string;
    latitude?: string;
    longitude?: string;
  };
  couponCode?: string;   // max 48 chars
  deliveryNotes?: string; // max 1000 chars
  cutleryPreference?: boolean;
  customerPhone?: string;  // max 24 chars
  customerEmail?: string;  // max 320 chars
}
```

**Request Example:**
```json
{
  "slug": "spice-garden",
  "lines": [
    {
      "menuItemId": "item_001",
      "quantity": 2,
      "modifiers": [
        {
          "optionId": "item_001-0",
          "name": "Large",
          "pricePaise": 200
        },
        {
          "optionId": "item_001-1",
          "name": "Extra cheese",
          "pricePaise": 70
        }
      ],
      "specialInstructions": "Less spicy"
    },
    {
      "menuItemId": "item_005",
      "quantity": 1,
      "modifiers": [],
      "specialInstructions": null
    }
  ],
  "address": {
    "flatHouse": "42",
    "area": "Koramangala",
    "city": "Bengaluru",
    "postalCode": "560034"
  },
  "couponCode": "WELCOME50",
  "deliveryNotes": "Ring the bell twice",
  "cutleryPreference": false,
  "customerPhone": "+919876543210",
  "customerEmail": "rahul@example.com"
}
```

**Response (success):**
```json
{
  "orderId": "ord_abc123",
  "orderNumber": "SG-20260831-001",
  "keyId": "rzp_live_xxxxxxxxxxxx",
  "providerOrderId": "order_RazXYZ123",
  "amountPaise": 62500,
  "currency": "INR"
}
```

**Server-side validation (all must pass):**
1. Restaurant exists and `isOpen = true`
2. Restaurant is within scheduled hours
3. Restaurant is not in temporary closure
4. Every item exists and `isOpen = true`
5. Every item's availability = `AVAILABLE`
6. Every item's price matches current database price
7. Stock is sufficient (if stock tracking enabled)
8. Coupon is valid (if provided): date range, usage limits, minimum order
9. Total meets restaurant minimum order
10. Delivery address is serviceable

**Errors:**
| Error | Cause |
|-------|-------|
| `Online payment is not configured yet.` | Razorpay keys not set |
| `Restaurant is currently closed` | isOpen = false |
| `Item [name] is not available` | Item disabled or sold out |
| `Minimum order is ₹199` | Cart total below minimum |
| `Coupon [CODE] is not valid` | Coupon expired/invalid |
| `Insufficient stock for [item]` | Stock too low |

---

### `storefront.verifyPayment`

Verifies Razorpay payment signature and captures the payment. Requires authentication.

**Type:** `mutation` (protected — requires session)  
**Procedure:** `storefront.verifyPayment`

**Input Schema:**
```typescript
{
  orderId: string;          // local order ID, min 5 chars
  providerOrderId: string;  // Razorpay order ID, min 5 chars
  providerPaymentId: string; // Razorpay payment ID, min 5 chars
  signature: string;        // HMAC signature, min 32 chars
}
```

**Request Example:**
```json
{
  "orderId": "ord_abc123",
  "providerOrderId": "order_RazXYZ123",
  "providerPaymentId": "pay_RazABC456",
  "signature": "a1b2c3d4e5f6..."
}
```

**Response (success):**
```json
{
  "success": true,
  "orderId": "ord_abc123",
  "status": "PAYMENT_CONFIRMED",
  "orderNumber": "SG-20260831-001"
}
```

**Errors:**
| Error | Cause |
|-------|-------|
| `Payment verification failed` | HMAC signature mismatch |
| `Order not found` | Invalid orderId |
| `Order is not in pending payment state` | Order already processed |

**Security notes:**
- Signature is verified using HMAC-SHA256 with `RAZORPAY_KEY_SECRET`
- Verification is done server-side only
- Frontend never receives the secret
- Payment is not marked confirmed purely from frontend callback

---

### `storefront.orderTracking`

Returns order details and status for customer order tracking.

**Type:** `query` (public)  
**Procedure:** `storefront.orderTracking`

**Security (Issue 1 fix):** Requires `trackingToken` — a cryptographically secure random token generated at order creation. Order number alone is insufficient to prevent IDOR attacks.

**Input Schema:**
```typescript
{
  orderNumber: string;  // min 5 chars, e.g., "ORD-MX4K2-1234"
  trackingToken: string; // min 16 chars, cryptographically random (40 chars base64url)
}
```

**Request Example:**
```json
{
  "orderNumber": "SG-20260831-001"
}
```

**Response (restricted — no PII or payment internals):**
```json
{
  "orderNumber": "ORD-MX4K2-1234",
  "status": "PREPARING",
  "paymentStatus": "PAID",
    "itemTotalPaise": 62000,
    "deliveryFeePaise": 3000,
    "packagingFeePaise": 2500,
    "taxPaise": 3225,
    "discountPaise": 5000,
    "totalPaise": 65725,
    "couponCode": "WELCOME50",
    "estimatedMinutes": 30,
    "createdAt": "2026-08-31T12:30:00.000Z",
    "acceptedAt": "2026-08-31T12:32:00.000Z",
    "preparingAt": "2026-08-31T12:33:00.000Z",
    "addressSnapshot": {
      "flatHouse": "42",
      "area": "Koramangala",
      "city": "Bengaluru"
    }
  },
  "items": [
    {
      "id": "oi_001",
      "itemNameSnapshot": "Chicken Biryani",
      "unitPricePaise": 28000,
      "quantity": 2,
      "dietaryType": "nonveg",
      "selectedModifiers": [
        { "groupName": "Size", "optionName": "Large", "pricePaise": 200 },
        { "groupName": "Extras", "optionName": "Extra cheese", "pricePaise": 70 }
      ],
      "specialInstructions": "Less spicy"
    }
  ],
  "statusHistory": [
    {
      "status": "PLACED",
      "note": "Order placed",
      "createdAt": "2026-08-31T12:30:00.000Z"
    },
    {
      "status": "PAYMENT_CONFIRMED",
      "note": "Payment verified",
      "createdAt": "2026-08-31T12:30:30.000Z"
    },
    {
      "status": "RESTAURANT_ACCEPTED",
      "note": null,
      "createdAt": "2026-08-31T12:32:00.000Z"
    },
    {
      "status": "PREPARING",
      "note": null,
      "createdAt": "2026-08-31T12:33:00.000Z"
    }
  ],
  "payment": {
    "provider": "razorpay",
    "providerPaymentId": "pay_RazABC456",
    "status": "CAPTURED",
    "amountPaise": 65725,
    "method": "upi"
  },
  "delivery": null
}
```

If order not found:
```json
null
```

---

## 6. Admin Router (Protected)

All admin endpoints require an authenticated session with `role: "admin"`.

**Authentication:** Include `app_session_id` cookie in requests.

**Error on unauthorized:**
```json
{
  "error": {
    "message": "Please login (10001)",
    "code": "UNAUTHORIZED"
  }
}
```

---

### `admin.dashboard`

Returns dashboard metrics, recent orders, and restaurant status.

**Type:** `query` (admin)  
**Procedure:** `admin.dashboard`

**Input Schema:**
```typescript
{
  slug: string;  // min 2 chars, e.g., "spice-garden"
}
```

**Request Example:**
```json
{
  "slug": "spice-garden"
}
```

**Response:**
```json
{
  "restaurant": {
    "id": "rest_abc123",
    "slug": "spice-garden",
    "name": "Spice Garden",
    "isOpen": true,
    "cuisineSummary": "Indian • Biryani • Kebabs",
    "primaryColor": "#C84630"
  },
  "outlet": {
    "id": "outlet_xyz",
    "name": "Main Kitchen"
  },
  "categories": [
    { "id": "cat_001", "name": "Biryani", "iconEmoji": "🍛" }
  ],
  "items": [
    {
      "id": "item_001",
      "name": "Chicken Biryani",
      "pricePaise": 28000,
      "offerPricePaise": 25000,
      "dietaryType": "nonveg",
      "isBestseller": true,
      "availability": "AVAILABLE",
      "isOpen": true,
      "description": "Aromatic basmati rice..."
    }
  ],
  "orders": [
    {
      "id": "ord_abc123",
      "orderNumber": "SG-20260831-001",
      "status": "PREPARING",
      "paymentStatus": "PAID",
      "totalPaise": 65725,
      "customerName": "Rahul",
      "customerPhone": "+919876543210",
      "createdAt": "2026-08-31T12:30:00.000Z"
    }
  ],
  "offers": [
    {
      "id": "coupon_001",
      "code": "WELCOME50",
      "description": "₹50 off on first order",
      "discountType": "flat",
      "discountValue": 5000,
      "minOrderPaise": 19900
    }
  ],
  "metrics": {
    "todayOrders": 12,
    "todaySalesPaise": 840000,
    "averageOrderValue": 70000,
    "totalItems": 35,
    "availableItems": 32,
    "openOrders": 5,
    "pendingOrders": 3,
    "preparingOrders": 2,
    "deliveredOrders": 8,
    "cancelledOrders": 1
  }
}
```

---

### `admin.restaurants`

Returns all restaurants in the system.

**Type:** `query` (admin)  
**Procedure:** `admin.restaurants`

**Request:** None

**Response:**
```json
[
  {
    "id": "rest_abc123",
    "slug": "spice-garden",
    "name": "Spice Garden",
    "isOpen": true,
    "cuisineSummary": "Indian • Biryani • Kebabs",
    "primaryColor": "#C84630",
    "deliveryFeePaise": 3000,
    "packagingFeePaise": 2500,
    "minOrderPaise": 19900
  }
]
```

---

### `admin.orders`

Returns orders with filtering, date range, and pagination.

**Type:** `query` (admin)  
**Procedure:** `admin.orders`

**Input Schema:**
```typescript
{
  restaurantId: string;          // min 4 chars
  status?: OrderStatus;          // optional filter
  startDate?: Date;              // optional date filter
  endDate?: Date;                // optional date filter
  customerId?: string;           // optional customer filter
  limit: number;                 // integer, 1-200, default 50
  offset: number;                // integer, >= 0, default 0
}
```

**OrderStatus enum values:**
```
PENDING_PAYMENT | PAYMENT_CONFIRMED | PLACED | RESTAURANT_ACCEPTED |
PREPARING | READY_FOR_PICKUP | DELIVERY_REQUESTED | RIDER_ASSIGNED |
PICKED_UP | OUT_FOR_DELIVERY | DELIVERED | CANCELLED | REJECTED |
REFUND_PENDING | REFUNDED
```

**Request Example:**
```json
{
  "restaurantId": "rest_abc123",
  "status": "PREPARING",
  "startDate": "2026-08-31T00:00:00.000Z",
  "endDate": "2026-08-31T23:59:59.999Z",
  "limit": 20,
  "offset": 0
}
```

**Response:**
```json
{
  "orders": [
    {
      "id": "ord_abc123",
      "orderNumber": "SG-20260831-001",
      "status": "PREPARING",
      "paymentStatus": "PAID",
      "totalPaise": 65725,
      "customerName": "Rahul",
      "customerPhone": "+919876543210",
      "createdAt": "2026-08-31T12:30:00.000Z"
    }
  ],
  "total": 45
}
```

---

### `admin.orderDetail`

Returns full order details including items, status history, payment, and delivery.

**Type:** `query` (admin)  
**Procedure:** `admin.orderDetail`

**Input Schema:**
```typescript
{
  orderId: string;  // min 4 chars
}
```

**Request Example:**
```json
{
  "orderId": "ord_abc123"
}
```

**Response:**
```json
{
  "order": {
    "id": "ord_abc123",
    "orderNumber": "SG-20260831-001",
    "status": "PREPARING",
    "paymentStatus": "PAID",
    "fulfillmentType": "DELIVERY",
    "customerName": "Rahul",
    "customerPhone": "+919876543210",
    "customerEmail": "rahul@example.com",
    "itemTotalPaise": 62000,
    "discountPaise": 5000,
    "packagingFeePaise": 2500,
    "deliveryFeePaise": 3000,
    "taxPaise": 3225,
    "totalPaise": 65725,
    "couponCode": "WELCOME50",
    "couponDiscountPaise": 5000,
    "deliveryNotes": "Ring the bell twice",
    "specialInstructions": "Less spicy",
    "estimatedMinutes": 30,
    "createdAt": "2026-08-31T12:30:00.000Z",
    "acceptedAt": "2026-08-31T12:32:00.000Z",
    "preparingAt": "2026-08-31T12:33:00.000Z",
    "readyAt": null,
    "deliveredAt": null,
    "cancelledAt": null,
    "addressSnapshot": {
      "flatHouse": "42",
      "area": "Koramangala",
      "city": "Bengaluru",
      "postalCode": "560034"
    }
  },
  "items": [
    {
      "id": "oi_001",
      "itemNameSnapshot": "Chicken Biryani",
      "unitPricePaise": 28000,
      "quantity": 2,
      "dietaryType": "nonveg",
      "selectedModifiers": [
        { "groupName": "Size", "optionName": "Large", "pricePaise": 200 },
        { "groupName": "Extras", "optionName": "Extra cheese", "pricePaise": 70 }
      ],
      "specialInstructions": "Less spicy"
    }
  ],
  "statusHistory": [
    {
      "status": "PLACED",
      "note": "Order placed",
      "createdAt": "2026-08-31T12:30:00.000Z"
    },
    {
      "status": "PREPARING",
      "note": null,
      "createdAt": "2026-08-31T12:33:00.000Z"
    }
  ],
  "payment": {
    "id": "pay_001",
    "provider": "razorpay",
    "providerOrderId": "order_RazXYZ123",
    "providerPaymentId": "pay_RazABC456",
    "status": "CAPTURED",
    "amountPaise": 65725,
    "method": "upi"
  },
  "delivery": null
}
```

---

### `admin.updateOrderStatus`

Changes the status of an order. Validates state transitions.

**Type:** `mutation` (admin)  
**Procedure:** `admin.updateOrderStatus`

**Input Schema:**
```typescript
{
  orderId: string;  // min 4 chars
  status: OrderStatus;
  note?: string;    // max 500 chars
}
```

**Request Example:**
```json
{
  "orderId": "ord_abc123",
  "status": "PREPARING",
  "note": "Kitchen started preparation"
}
```

**Response:**
```json
{
  "success": true
}
```

**Side effects:**
- Updates order status
- Creates `orderStatusHistory` record
- Creates `auditLogs` record
- If status = CANCELLED: triggers refund if payment was captured
- If status = REJECTED: triggers refund if payment was captured

**Valid transitions:**

| From | Allowed To |
|------|-----------|
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

**Errors:**
| Error | Cause |
|-------|-------|
| `Invalid status transition` | Tried to move to disallowed state |
| `Order not found` | Invalid orderId |

---

### `admin.updateSettings`

Updates restaurant configuration.

**Type:** `mutation` (admin)  
**Procedure:** `admin.updateSettings`

**Input Schema:**
```typescript
{
  id: string;                      // restaurant ID
  name: string;                    // 2-180 chars
  cuisineSummary: string;          // 2-255 chars
  description?: string;            // max 2000 chars
  primaryColor: string;            // hex color, e.g., "#C84630"
  deliveryFeePaise: number;        // integer, >= 0
  packagingFeePaise: number;       // integer, >= 0
  minOrderPaise: number;           // integer, >= 0
  isOpen: boolean;                 // true = accepting orders
  allowScheduledOrders: boolean;
  preparationMinutes?: number;     // positive integer
  deliveryRadiusKm?: number;       // positive number
  gstNumber?: string;
  gstPercentage?: string;
  tempClosureStart?: Date | null;
  tempClosureEnd?: Date | null;
  tempClosureMessage?: string | null;  // max 500 chars
}
```

**Request Example:**
```json
{
  "id": "rest_abc123",
  "name": "Spice Garden",
  "cuisineSummary": "Indian • Biryani • Kebabs",
  "description": "Authentic North Indian cuisine since 2024",
  "primaryColor": "#C84630",
  "deliveryFeePaise": 3000,
  "packagingFeePaise": 2500,
  "minOrderPaise": 19900,
  "isOpen": true,
  "allowScheduledOrders": true,
  "preparationMinutes": 25,
  "deliveryRadiusKm": 5
}
```

**Response:**
```json
{
  "success": true
}
```

**Side effects:**
- Creates `auditLogs` record

---

### `admin.createMenuItem`

Creates a new menu item.

**Type:** `mutation` (admin)  
**Procedure:** `admin.createMenuItem`

**Input Schema:**
```typescript
{
  restaurantId: string;  // min 4 chars
  categoryId: string;    // min 4 chars
  name: string;          // 2-180 chars
  description?: string;  // max 1000 chars
  pricePaise: number;    // positive integer (paise)
  offerPricePaise?: number; // positive integer (paise)
  dietaryType: "veg" | "nonveg" | "egg";
  imageUrl?: string;     // valid URL
  isCustomizable?: boolean;
  sku?: string;          // max 64 chars
}
```

**Request Example:**
```json
{
  "restaurantId": "rest_abc123",
  "categoryId": "cat_001",
  "name": "Chicken Biryani",
  "description": "Aromatic basmati rice layered with tender chicken",
  "pricePaise": 28000,
  "offerPricePaise": 25000,
  "dietaryType": "nonveg",
  "isCustomizable": true,
  "sku": "BIRYANI-CHKN-001"
}
```

**Response:**
```json
{
  "id": "item_001",
  "restaurantId": "rest_abc123",
  "categoryId": "cat_001",
  "name": "Chicken Biryani",
  "pricePaise": 28000,
  "offerPricePaise": 25000,
  "dietaryType": "nonveg",
  "isOpen": true,
  "availability": "AVAILABLE",
  "createdAt": "2026-08-31T12:00:00.000Z"
}
```

**Side effects:**
- Creates `auditLogs` record

---

### `admin.updateMenuItem`

Updates an existing menu item.

**Type:** `mutation` (admin)  
**Procedure:** `admin.updateMenuItem`

**Input Schema:**
```typescript
{
  itemId: string;  // min 4 chars
  name?: string;
  description?: string;
  pricePaise?: number;
  offerPricePaise?: number | null;
  categoryId?: string;
  dietaryType?: "veg" | "nonveg" | "egg";
  isBestseller?: boolean;
  isRecommended?: boolean;
  isOpen?: boolean;
  sortOrder?: number;
  stock?: number | null;
}
```

**Request Example:**
```json
{
  "itemId": "item_001",
  "name": "Chicken Biryani Special",
  "pricePaise": 30000,
  "isBestseller": true
}
```

**Response:**
```json
{
  "success": true
}
```

**Side effects:**
- Creates `auditLogs` record with before/after data

---

### `admin.updateMenuAvailability`

Changes item availability status.

**Type:** `mutation` (admin)  
**Procedure:** `admin.updateMenuAvailability`

**Input Schema:**
```typescript
{
  itemId: string;  // min 4 chars
  availability: "AVAILABLE" | "SOLD_OUT" | "SCHEDULED_UNAVAILABLE" | "OUT_OF_STOCK" | "DISABLED";
  availableNote?: string;  // max 160 chars
}
```

**Request Example:**
```json
{
  "itemId": "item_001",
  "availability": "SOLD_OUT",
  "availableNote": "Sold out for today"
}
```

**Response:**
```json
{
  "success": true
}
```

---

### `admin.toggleItemOpen`

Quick toggle to enable/disable an item.

**Type:** `mutation` (admin)  
**Procedure:** `admin.toggleItemOpen`

**Input Schema:**
```typescript
{
  itemId: string;  // min 4 chars
  isOpen: boolean;
}
```

**Request Example:**
```json
{
  "itemId": "item_001",
  "isOpen": false
}
```

**Response:**
```json
{
  "success": true
}
```

---

### `admin.createCategory`

Creates a new menu category.

**Type:** `mutation` (admin)  
**Procedure:** `admin.createCategory`

**Input Schema:**
```typescript
{
  restaurantId: string;  // min 4 chars
  name: string;          // 2-120 chars
  description?: string;  // max 500 chars
  sortOrder?: number;    // integer
}
```

**Request Example:**
```json
{
  "restaurantId": "rest_abc123",
  "name": "Biryani",
  "description": "Our signature biryani collection",
  "sortOrder": 1
}
```

**Response:**
```json
{
  "id": "cat_001",
  "name": "Biryani",
  "slug": "biryani",
  "sortOrder": 1,
  "isVisible": true,
  "isOpen": true
}
```

---

### `admin.updateCategory`

Updates an existing category.

**Type:** `mutation` (admin)  
**Procedure:** `admin.updateCategory`

**Input Schema:**
```typescript
{
  categoryId: string;  // min 4 chars
  name?: string;       // 2-120 chars
  sortOrder?: number;
  isVisible?: boolean;
  isOpen?: boolean;
}
```

**Request Example:**
```json
{
  "categoryId": "cat_001",
  "name": "Biryani Specials",
  "sortOrder": 1,
  "isVisible": true
}
```

**Response:**
```json
{
  "success": true
}
```

---

### `admin.upsertCoupon`

Creates or updates a coupon.

**Type:** `mutation` (admin)  
**Procedure:** `admin.upsertCoupon`

**Input Schema:**
```typescript
{
  restaurantId: string;     // min 4 chars
  code: string;             // 3-48 chars (auto-uppercased)
  description: string;      // 4-255 chars
  discountType: "flat" | "percent";
  discountValue: number;    // positive integer (paise for flat, percentage×100 for percent)
  minOrderPaise: number;    // >= 0
  maxDiscountPaise?: number; // positive integer, cap for percent discounts
  totalUsageLimit?: number;  // positive integer
  perCustomerLimit?: number; // positive integer, default 1
  isNewCustomerOnly?: boolean;
  startsAt?: Date;
  endsAt?: Date;
}
```

**Request Example:**
```json
{
  "restaurantId": "rest_abc123",
  "code": "WELCOME50",
  "description": "₹50 off on first order",
  "discountType": "flat",
  "discountValue": 5000,
  "minOrderPaise": 19900,
  "maxDiscountPaise": 5000,
  "totalUsageLimit": 1000,
  "perCustomerLimit": 1,
  "isNewCustomerOnly": true,
  "startsAt": "2026-08-31T00:00:00.000Z",
  "endsAt": "2026-09-30T23:59:59.999Z"
}
```

**Response:**
```json
{
  "id": "coupon_001",
  "code": "WELCOME50",
  "description": "₹50 off on first order",
  "discountType": "flat",
  "discountValue": 5000,
  "isActive": true
}
```

---

### `admin.customers`

Returns paginated customer list with search.

**Type:** `query` (admin)  
**Procedure:** `admin.customers`

**Input Schema:**
```typescript
{
  search?: string;   // search by name, email, mobile
  limit: number;     // integer, 1-100, default 50
  offset: number;    // integer, >= 0, default 0
}
```

**Request Example:**
```json
{
  "search": "rahul",
  "limit": 20,
  "offset": 0
}
```

**Response:**
```json
{
  "customers": [
    {
      "id": "cust_001",
      "userId": 5,
      "mobileNumber": "+919876543210",
      "preferredName": "Rahul",
      "totalOrders": 12,
      "totalSpentPaise": 840000,
      "createdAt": "2026-08-01T10:00:00.000Z",
      "updatedAt": "2026-08-31T12:00:00.000Z"
    }
  ],
  "total": 45
}
```

---

### `admin.customerDetail`

Returns full customer details including addresses and order history.

**Type:** `query` (admin)  
**Procedure:** `admin.customerDetail`

**Input Schema:**
```typescript
{
  customerId: string;  // min 4 chars
}
```

**Request Example:**
```json
{
  "customerId": "cust_001"
}
```

**Response:**
```json
{
  "customer": {
    "id": "cust_001",
    "userId": 5,
    "mobileNumber": "+919876543210",
    "preferredName": "Rahul",
    "adminNotes": "VIP customer",
    "totalOrders": 12,
    "totalSpentPaise": 840000,
    "createdAt": "2026-08-01T10:00:00.000Z"
  },
  "addresses": [
    {
      "id": "addr_001",
      "label": "Home",
      "flatHouse": "42",
      "area": "Koramangala",
      "city": "Bengaluru",
      "postalCode": "560034",
      "isDefault": true
    }
  ],
  "recentOrders": [
    {
      "id": "ord_abc123",
      "orderNumber": "SG-20260831-001",
      "status": "DELIVERED",
      "totalPaise": 65725,
      "createdAt": "2026-08-31T12:30:00.000Z"
    }
  ]
}
```

---

### `admin.updateCustomerNotes`

Updates admin notes for a customer.

**Type:** `mutation` (admin)  
**Procedure:** `admin.updateCustomerNotes`

**Input Schema:**
```typescript
{
  customerId: string;  // min 4 chars
  notes: string;       // max 2000 chars
}
```

**Request Example:**
```json
{
  "customerId": "cust_001",
  "notes": "VIP customer — prefers extra spicy. Always orders on weekends."
}
```

**Response:**
```json
{
  "success": true
}
```

---

### `admin.salesReport`

Returns sales analytics for a date range.

**Type:** `query` (admin)  
**Procedure:** `admin.salesReport`

**Input Schema:**
```typescript
{
  restaurantId: string;  // min 4 chars
  startDate: Date;
  endDate: Date;
}
```

**Request Example:**
```json
{
  "restaurantId": "rest_abc123",
  "startDate": "2026-08-01T00:00:00.000Z",
  "endDate": "2026-08-31T23:59:59.999Z"
}
```

**Response:**
```json
{
  "grossSalesPaise": 2520000,
  "netSalesPaise": 2370000,
  "orderCount": 84,
  "averageOrderValue": 30000,
  "totalTaxPaise": 126000,
  "totalPackagingPaise": 210000,
  "totalDeliveryPaise": 252000,
  "totalDiscountPaise": 150000,
  "totalRefundPaise": 45000,
  "cancelledValuePaise": 105000,
  "topItems": [
    { "name": "Chicken Biryani", "unitsSold": 42, "revenuePaise": 1176000 },
    { "name": "Mutton Biryani", "unitsSold": 28, "revenuePaise": 980000 }
  ],
  "topCategories": [
    { "name": "Biryani", "revenuePaise": 2156000 },
    { "name": "Starters", "revenuePaise": 364000 }
  ],
  "dailyBreakdown": [
    { "date": "2026-08-01", "orders": 5, "salesPaise": 150000 },
    { "date": "2026-08-02", "orders": 8, "salesPaise": 240000 }
  ]
}
```

---

### `admin.integrationStatus`

Returns the status of all configured integrations.

**Type:** `query` (admin)  
**Procedure:** `admin.integrationStatus`

**Request:** None

**Response:**
```json
{
  "razorpay": {
    "configured": true,
    "keyIdSet": true,
    "secretSet": true,
    "webhookSecretSet": true,
    "mode": "live"
  },
  "shadowfax": {
    "configured": false,
    "apiKeySet": false,
    "merchantIdSet": false,
    "webhookSecretSet": false,
    "mode": "mock"
  }
}
```

---

### `admin.saveIntegrationSecret`

Saves an encrypted integration credential.

**Type:** `mutation` (admin)  
**Procedure:** `admin.saveIntegrationSecret`

**Input Schema:**
```typescript
{
  restaurantId: string;  // min 4 chars
  provider: "razorpay" | "otp" | "delivery";
  keyName: string;       // 3-96 chars
  value: string;         // 1-4096 chars
}
```

**Request Example:**
```json
{
  "restaurantId": "rest_abc123",
  "provider": "razorpay",
  "keyName": "key_secret",
  "value": "rzp_live_xxxxxxxxxxxx"
}
```

**Response:**
```json
{
  "success": true
}
```

**Security:**
- Value is encrypted with AES-256-GCM before storage
- Stored in `integration_secrets` table
- Never returned in plaintext via any API
- Creates `auditLogs` record

---

### `admin.verifyIntegrationSecret`

Checks if a specific integration secret is configured.

**Type:** `mutation` (admin)  
**Procedure:** `admin.verifyIntegrationSecret`

**Input Schema:**
```typescript
{
  restaurantId: string;
  provider: "razorpay" | "otp" | "delivery";
  keyName: string;
}
```

**Response:**
```json
{
  "readable": true
}
```

Returns `true` if the secret exists and can be decrypted.

---

### `admin.previewMenuImport`

Parses CSV menu data and returns validation results without importing.

**Type:** `mutation` (admin)  
**Procedure:** `admin.previewMenuImport`

**Input Schema:**
```typescript
{
  csv: string;  // 10 to 1,500,000 chars
}
```

**Request Example:**
```json
{
  "csv": "name,price,category,dietaryType\nChicken Biryani,280,Biryani,nonveg\nVeg Spring Rolls,180,Starters,veg"
}
```

**Response:**
```json
{
  "totalRows": 2,
  "validRows": 2,
  "errorRows": 0,
  "errors": [],
  "preview": [
    {
      "row": 1,
      "name": "Chicken Biryani",
      "pricePaise": 28000,
      "category": "Biryani",
      "dietaryType": "nonveg",
      "status": "valid"
    },
    {
      "row": 2,
      "name": "Veg Spring Rolls",
      "pricePaise": 18000,
      "category": "Starters",
      "dietaryType": "veg",
      "status": "valid"
    }
  ]
}
```

---

### `admin.applyMenuImport`

Imports menu items from CSV. Creates new items or updates existing by SKU.

**Type:** `mutation` (admin)  
**Procedure:** `admin.applyMenuImport`

**Input Schema:**
```typescript
{
  restaurantId: string;  // min 4 chars
  csv: string;           // 10 to 1,500,000 chars
}
```

**Request Example:**
```json
{
  "restaurantId": "rest_abc123",
  "csv": "name,price,category,dietaryType,sku\nChicken Biryani,280,Biryani,nonveg,BIRYANI-CHKN-001\nVeg Spring Rolls,180,Starters,veg,STARTERS-VEG-001"
}
```

**Response:**
```json
{
  "created": 2,
  "updated": 0,
  "skipped": 0,
  "errors": []
}
```

**Side effects:**
- Creates `auditLogs` record with import summary

---

### `admin.checkDeliveryServiceability`

Checks if a pincode is serviceable via Shadowfax.

**Type:** `query` (admin)  
**Procedure:** `admin.checkDeliveryServiceability`

**Input Schema:**
```typescript
{
  pincode: string;  // 4-10 chars
}
```

**Response:**
```json
{
  "serviceable": true,
  "estimatedDeliveryMinutes": 35,
  "deliveryFeePaise": 3000
}
```

---

### `admin.initiateRefund`

Initiates a refund via Razorpay for a paid order.

**Type:** `mutation` (admin)  
**Procedure:** `admin.initiateRefund`

**Input Schema:**
```typescript
{
  orderId: string;      // min 4 chars
  paymentId: string;    // min 4 chars (payment record ID)
  amountPaise: number;  // positive integer
  reason?: string;      // max 500 chars
}
```

**Request Example:**
```json
{
  "orderId": "ord_abc123",
  "paymentId": "pay_001",
  "amountPaise": 65725,
  "reason": "Customer reported food quality issue"
}
```

**Response:**
```json
{
  "refundId": "ref_001",
  "status": "PENDING",
  "amountPaise": 65725
}
```

**Side effects:**
- Creates `refunds` record
- Updates order status to `REFUND_PENDING`
- Calls Razorpay Refunds API
- Creates `auditLogs` record

---

### `admin.auditLogs`

Returns audit log entries with optional filtering.

**Type:** `query` (admin)  
**Procedure:** `admin.auditLogs`

**Input Schema:**
```typescript
{
  targetType?: string;  // e.g., "order", "menuItem", "restaurant", "integration"
  targetId?: string;
  limit: number;        // integer, 1-100, default 50
}
```

**Request Example:**
```json
{
  "targetType": "order",
  "limit": 20
}
```

**Response:**
```json
[
  {
    "id": "audit_001",
    "actorId": 1,
    "actorName": "Kitchen Administrator",
    "action": "Order status changed to PREPARING",
    "targetType": "order",
    "targetId": "ord_abc123",
    "beforeData": { "status": "RESTAURANT_ACCEPTED" },
    "afterData": { "status": "PREPARING", "note": "Kitchen started" },
    "ipAddress": "192.168.1.100",
    "createdAt": "2026-08-31T12:33:00.000Z"
  }
]
```

---

### `admin.getSetting`

Returns a setting value by key.

**Type:** `query` (admin)  
**Procedure:** `admin.getSetting`

**Input Schema:**
```typescript
{
  key: string;  // min 1 char
}
```

**Response:**
```json
{
  "id": "set_001",
  "key": "business.timezone",
  "value": "Asia/Kolkata",
  "category": "general",
  "createdAt": "2026-08-31T10:00:00.000Z",
  "updatedAt": "2026-08-31T10:00:00.000Z"
}
```

---

### `admin.setSetting`

Creates or updates a setting.

**Type:** `mutation` (admin)  
**Procedure:** `admin.setSetting`

**Input Schema:**
```typescript
{
  key: string;       // min 1 char
  value: string;
  category: string;  // default "general"
}
```

**Request Example:**
```json
{
  "key": "business.timezone",
  "value": "Asia/Kolkata",
  "category": "general"
}
```

**Response:**
```json
{
  "success": true
}
```

---

## 7. Webhook Endpoints

### Razorpay Webhook

**URL:** `https://9housekitchen.in/api/trpc/storefront.razorpayWebhook`  
**Method:** POST  
**Auth:** HMAC signature verification (not session-based)  
**Content-Type:** application/json

**Headers:**
```
X-Razorpay-Signature: <hmac-sha256-signature>
```

**Body:**
```json
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_RazABC456",
        "order_id": "order_RazXYZ123",
        "amount": 65725,
        "status": "captured",
        "method": "upi"
      }
    }
  }
}
```

**Handled events:**
| Event | Action |
|-------|--------|
| `payment.captured` | Mark payment CAPTURED, update order to PAYMENT_CONFIRMED |
| `payment.failed` | Mark payment FAILED, update order to PAYMENT_FAILED |
| `refund.created` | Update refund status to PENDING |
| `refund.processed` | Update refund status to PROCESSED |
| `refund.failed` | Update refund status to FAILED |

**Response:** 200 OK

**Idempotency:** Events are deduplicated via `webhook_events` table (unique on `provider + externalId`).

---

### Shadowfax Webhook

**URL:** `https://9housekitchen.in/api/trpc/storefront.shadowfaxWebhook`  
**Method:** POST  
**Auth:** Signature verification (if configured)  
**Content-Type:** application/json

**Body:**
```json
{
  "payload": {
    "delivery_id": "sf_123456",
    "status": "rider_assigned",
    "rider": {
      "name": "Amit",
      "phone": "+919876543210"
    }
  },
  "signature": "optional-signature"
}
```

**Handled status updates:**
| Shadowfax Status | Internal Action |
|-----------------|-----------------|
| `rider_assigned` | Update delivery + order to RIDER_ASSIGNED |
| `picked_up` | Update delivery + order to PICKED_UP |
| `out_for_delivery` | Update delivery + order to OUT_FOR_DELIVERY |
| `delivered` | Update delivery + order to DELIVERED |
| `cancelled` / `failed` | Flag for manual review |

**Response:** 200 OK

---

## 8. Data Types & Enums

### Order Status Enum

```typescript
type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_CONFIRMED"
  | "PLACED"
  | "RESTAURANT_ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "DELIVERY_REQUESTED"
  | "RIDER_ASSIGNED"
  | "PICKED_UP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED"
  | "REFUND_PENDING"
  | "REFUNDED";
```

### Payment Status Enum

```typescript
type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUND_PENDING" | "REFUNDED";

type PaymentProviderStatus = "CREATED" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "CANCELLED" | "REFUNDED";
```

### Dietary Type Enum

```typescript
type DietaryType = "veg" | "nonveg" | "egg";
```

### Availability Enum

```typescript
type Availability =
  | "AVAILABLE"
  | "SOLD_OUT"
  | "SCHEDULED_UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "DISABLED";
```

### Discount Type Enum

```typescript
type DiscountType = "flat" | "percent";
```

### Address Label Enum

```typescript
type AddressLabel = "Home" | "Work" | "Other";
```

### Refund Status Enum

```typescript
type RefundStatus = "PENDING" | "PROCESSED" | "FAILED";
```

### Integration Provider Enum

```typescript
type IntegrationProvider = "razorpay" | "otp" | "delivery";
```

---

## 9. Webhook Signatures

### Razorpay Signature Verification

```typescript
import crypto from "crypto";

function verifyRazorpaySignature(
  body: string,              // raw request body as string
  signature: string,         // from X-Razorpay-Signature header
  webhookSecret: string      // from RAZORPAY_WEBHOOK_SECRET env
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Shadowfax Signature Verification

```typescript
// When SHADOWFAX_WEBHOOK_SECRET is configured:
function verifyShadowfaxSignature(
  payload: string,
  signature: string,
  webhookSecret: string
): boolean {
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

---

## 10. Rate Limiting

Rate limits are applied at the nginx level:

| Endpoint Category | Rate Limit | Window |
|-------------------|-----------|--------|
| General API | 30 req/s | 1 second |
| Auth endpoints | 5 req/s | 1 second |
| Webhook endpoints | 60 req/s | 1 second |
| Static assets | 100 req/s | 1 second |

Rate limit headers:
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 28
X-RateLimit-Reset: 1693478400
```

When rate limited:
```json
{
  "error": {
    "message": "Too many requests",
    "code": "RATE_LIMITED",
    "data": {
      "httpStatus": 429
    }
  }
}
```

---

## Appendix: tRPC Batch Requests

tRPC supports batching multiple queries in a single HTTP request:

```
GET /api/trpc/system.health,auth.me,storefront.get?input={"0":{"slug":"spice-garden"}}
```

Response is an array of results:
```json
[
  { "result": { "data": { "status": "ok" } } },
  { "result": { "data": { "id": 1, "role": "admin" } } },
  { "result": { "data": { "restaurant": {...} } } }
]
```

---

*Document generated for 9House Kitchen — Cloud-Kitchen Ordering Platform*  
*Protocol: tRPC v11 | Auth: JWT Cookie | DB: PostgreSQL via Drizzle ORM*
