# App Flow — 9House Kitchen Platform

**Version:** 1.0  
**Date:** August 31, 2026  
**Domain:** 9housekitchen.in

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Route Map](#2-route-map)
3. [Customer Storefront Flow](#3-customer-storefront-flow)
4. [Admin Panel Flow](#4-admin-panel-flow)
5. [Authentication Flow](#5-authentication-flow)
6. [Order Lifecycle Flow](#6-order-lifecycle-flow)
7. [Payment Flow](#7-payment-flow)
8. [Delivery Flow](#8-delivery-flow)
9. [Screen Inventory](#9-screen-inventory)
10. [State Diagrams](#10-state-diagrams)
11. [Error & Edge Case Flows](#11-error--edge-case-flows)

---

## 1. Platform Overview

The platform has two distinct user experiences:

```
┌──────────────────────────────────────────────────────────┐
│                   9housekitchen.in                        │
├──────────────────────┬───────────────────────────────────┤
│   CUSTOMER STOREFRONT │        ADMIN PANEL                │
│   (Public, mobile-first) │     (Authenticated, desktop)  │
│                       │                                   │
│   Browse → Cart →     │     Login → Dashboard →           │
│   Checkout → Pay →    │     Orders → Menu →               │
│   Track Order         │     Coupons → Settings            │
└──────────────────────┴───────────────────────────────────┘
```

| Experience | Entry Point | Auth Required | Target Device |
|-----------|-------------|---------------|---------------|
| Storefront | `https://9housekitchen.in/` | No (guest OK) | Mobile-first, responsive |
| Admin Panel | `https://9housekitchen.in/admin` | Yes (admin passphrase) | Desktop / tablet |

---

## 2. Route Map

### All Routes

| Route | Component | Auth | Description |
|-------|-----------|------|-------------|
| `/` | `OrderingApp` | No | Storefront — homepage/menu |
| `/spice-garden` | `OrderingApp` | No | Restaurant-specific menu |
| `/spice-garden/cart` | `OrderingApp` (cart screen) | No | Shopping cart |
| `/spice-garden/checkout` | `OrderingApp` (checkout screen) | No | Order review & payment |
| `/spice-garden/confirmation?order=XXX` | `OrderingApp` (confirmation screen) | No | Order success |
| `/spice-garden/order/:id` | `OrderingApp` (tracking screen) | No | Order tracking |
| `/admin` | `Admin` | Yes | Admin dashboard (overview) |
| `/admin/orders` | `Admin` (orders section) | Yes | Order management |
| `/admin/menu` | `Admin` (menu section) | Yes | Menu CRUD & availability |
| `/admin/import` | `Admin` (import workspace) | Yes | Bulk CSV import |
| `/admin/coupons` | `Admin` (coupons section) | Yes | Coupon management |
| `/admin/restaurant` | `Admin` (restaurant section) | Yes | Restaurant settings |
| `/admin/integrations` | `Admin` (integrations section) | Yes | Razorpay & Shadowfax config |

### Route Resolution Logic

```
URL Path                          → Screen
─────────────────────────────────────────────
/                                 → Menu (default)
/spice-garden                     → Menu
/spice-garden/cart                → Cart
/spice-garden/checkout            → Checkout
/spice-garden/confirmation?order= → Confirmation
/spice-garden/order/:id           → Order Tracking
/admin                            → Admin Overview
/admin/orders                     → Order Management
/admin/menu                       → Menu Management
/admin/import                     → Import Workspace
/admin/coupons                    → Coupons
/admin/restaurant                 → Restaurant Settings
/admin/integrations               → Integration Settings
/* (any other)                    → Menu (fallback)
```

---

## 3. Customer Storefront Flow

### 3.1 First Visit → Order Placement (Complete Journey)

```
┌─────────────┐
│  App Load    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  SCREEN 1: MENU / HOMEPAGE                               │
│  URL: / or /spice-garden                                 │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ┌─ TopBar ──────────────────────────────────┐    │  │
│  │  │ 🏠 Spice Garden    🛒 Cart (3)            │    │  │
│  │  └───────────────────────────────────────────┘    │  │
│  │                                                    │  │
│  │  ┌─ Hero Banner ─────────────────────────────┐    │  │
│  │  │  Spice Garden                              │    │  │
│  │  │  Indian • Biryani • Kebabs                 │    │  │
│  │  │  🕐 25-35 min  🚲 ₹30 delivery  👜 ₹199 min│  │  │
│  │  └───────────────────────────────────────────┘    │  │
│  │                                                    │  │
│  │  ┌─ Delivery Address Bar ───────────────────┐     │  │
│  │  │ 📍 Delivery service · Bengaluru          │     │  │
│  │  └──────────────────────────────────────────┘     │  │
│  │                                                    │  │
│  │  ┌─ Offer Banner ──────────────────────────┐      │  │
│  │  │ 🎫 WELCOME50 — ₹50 off on first order   │      │  │
│  │  └──────────────────────────────────────────┘      │  │
│  │                                                    │  │
│  │  ┌─ Category Pills (Mobile) ───────────────┐      │  │
│  │  │ 🍛 Biryani  🍗 Starters  🫓 Breads  ... │      │  │
│  │  └──────────────────────────────────────────┘      │  │
│  │                                                    │  │
│  │  ┌─ Search Bar ────────────────────────────┐       │  │
│  │  │ 🔍 Search dishes, cuisines, or categories│       │  │
│  │  └──────────────────────────────────────────┘      │  │
│  │                                                    │  │
│  │  ┌─ Filter Chips ─────────────────────────┐        │  │
│  │  │ [All] [Veg] [Non-Veg] [Bestseller]      │        │  │
│  │  └──────────────────────────────────────────┘      │  │
│  │                                                    │  │
│  │  ┌─ Collections (when at top) ────────────┐        │  │
│  │  │ ✨ Bestsellers                           │        │  │
│  │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │        │  │
│  │  │  │Item 1│ │Item 2│ │Item 3│ │Item 4│  │        │  │
│  │  │  └──────┘ └──────┘ └──────┘ └──────┘  │        │  │
│  │  │                                         │        │  │
│  │  │ 🌟 Recommended                          │        │  │
│  │  │  ┌──────┐ ┌──────┐ ┌──────┐            │        │  │
│  │  │  │Item 5│ │Item 6│ │Item 7│            │        │  │
│  │  │  └──────┘ └──────┘ └──────┘            │        │  │
│  │  └──────────────────────────────────────────┘      │  │
│  │                                                    │  │
│  │  ┌─ Menu Items ────────────────────────────┐       │  │
│  │  │  Category: Biryani                       │       │  │
│  │  │                                           │       │  │
│  │  │  ┌─────────────────────────────────────┐ │       │  │
│  │  │  │ V │ Chicken Biryani          ₹280   │ │       │  │
│  │  │  │   │ Aromatic basmati rice...  BEST  │ │       │  │
│  │  │  │   │ 🌶️🌶️                         │ │       │  │
│  │  │  │   │ [IMAGE]                       │ │       │  │
│  │  │  │   │      [ CUSTOMIZE ]            │ │       │  │
│  │  │  └─────────────────────────────────────┘ │       │  │
│  │  │                                           │       │  │
│  │  │  ┌─────────────────────────────────────┐ │       │  │
│  │  │  │ NV │ Mutton Biryani          ₹350  │ │       │  │
│  │  │  │    │ Tender mutton slow...         │ │       │  │
│  │  │  │    │ [IMAGE]                        │ │       │  │
│  │  │  │    │       [ ADD + ]                │ │       │  │
│  │  │  └─────────────────────────────────────┘ │       │  │
│  │  └──────────────────────────────────────────┘       │  │
│  │                                                    │  │
│  │  ┌─ Mobile Cart Bar (when items in cart) ──┐      │  │
│  │  │  3 items in your order   ₹650  View cart ▸│     │  │
│  │  └──────────────────────────────────────────┘      │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Navigation Actions from Menu Screen

```
Menu Screen
    │
    ├── Tap on Category Pill ──────────► Scrolls to that category section
    │
    ├── Type in Search Bar ────────────► Shows search results (filtered)
    │                                    Category pills hidden
    │                                    "Results for 'biryani'" shown
    │                                    "Clear" button available
    │
    ├── Tap Filter Chip ───────────────► Filters items (veg/non-veg/bestseller)
    │
    ├── Tap "ADD +" Button ────────────► Item added to cart (+1 qty)
    │                                    Toast: "Chicken Biryani added to your order"
    │                                    Cart badge updates
    │
    ├── Tap "CUSTOMIZE" Button ────────► Opens Customization Drawer (see 3.3)
    │
    ├── Tap Cart Icon (TopBar) ────────► Nothing (currently no-op on mobile)
    │
    ├── Tap "View cart" Bar ───────────► Nothing (currently no-op)
    │
    ├── Tap Address Bar ───────────────► Opens Address Dialog (see 3.6)
    │
    └── Tap Offer Banner ──────────────► (Future: opens coupon details)
```

### 3.3 Customization Flow (for customizable items)

```
Tap "CUSTOMIZE"
       │
       ▼
┌──────────────────────────────────────────┐
│  SCREEN: CUSTOMIZATION DRAWER            │
│  (Bottom sheet on mobile, modal on desk) │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  V  CUSTOMIZE              ✕      │  │
│  │  Chicken Biryani                  │  │
│  │  Aromatic basmati rice layered    │  │
│  │  with tender chicken...           │  │
│  ├────────────────────────────────────┤  │
│  │                                    │  │
│  │  Choose size (Required)           │  │
│  │  ┌──────────────────────────────┐ │  │
│  │  │ ○ Regular                    │ │  │
│  │  │ ○ Medium  +₹100             │ │  │
│  │  │ ○ Large   +₹200             │ │  │
│  │  └──────────────────────────────┘ │  │
│  │                                    │  │
│  │  Add extras (optional)            │  │
│  │  ┌──────────────────────────────┐ │  │
│  │  │ ☐ Extra cheese      +₹70    │ │  │
│  │  │ ☐ Jalapeño          +₹40    │ │  │
│  │  └──────────────────────────────┘ │  │
│  │                                    │  │
│  │  Special instructions             │  │
│  │  ┌──────────────────────────────┐ │  │
│  │  │ Less spicy, no onions...     │ │  │
│  │  └──────────────────────────────┘ │  │
│  │                                    │  │
│  │  Quantity: [-] 1 [+]             │  │
│  │                                    │  │
│  ├────────────────────────────────────┤  │
│  │  [ Add item              ₹550 ]  │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**Customization Actions:**

```
Customization Drawer
    │
    ├── Select Size ────────────────────► Price updates in real-time
    │
    ├── Toggle Extra ───────────────────► Checkbox toggles, price updates
    │
    ├── Type Instructions ──────────────► Stored as specialInstructions
    │
    ├── Adjust Quantity ────────────────► Multiplies total price
    │
    ├── Tap "Add item" ─────────────────► Closes drawer
    │                                    Item added to cart with all selections
    │                                    Toast: "Chicken Biryani added to your order"
    │                                    Cart badge/bar updates
    │
    └── Tap ✕ ──────────────────────────► Closes drawer (no item added)
```

### 3.4 Cart Flow

```
Tap "View cart" (mobile) / Cart sidebar (desktop)
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  SCREEN: CART                                           │
│  URL: /spice-garden/cart                                │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  ←  Your order                                    │  │
│  │      Review & checkout                             │  │
│  ├───────────────────────────────────────────────────┤  │
│  │                                                     │  │
│  │  3 items from your order     + Add more items       │  │
│  │                                                     │  │
│  │  Chicken Biryani                                   │  │
│  │  Regular · Extra cheese                            │  │
│  │  "Less spicy"                                      │  │
│  │  Remove                           ₹550    [-] 1 [+]│  │
│  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  │
│  │  Mutton Biryani                                     │  │
│  │  Large                                             │  │
│  │  Remove                           ₹550    [-] 1 [+]│  │
│  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  │
│  │  Veg Spring Rolls                                   │  │
│  │  No customizations                                  │  │
│  │  Remove                           ₹180    [-] 2 [+]│  │
│  │                                                     │  │
│  ├───────────────────────────────────────────────────┤  │
│  │  Order Summary (sidebar)                           │  │
│  │  Item total              ₹1,460                    │  │
│  │  Packaging               ₹25                       │  │
│  │  Delivery                ₹30                       │  │
│  │  Taxes                   ₹74                       │  │
│  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                │  │
│  │  To pay                  ₹1,589                    │  │
│  │                                                     │  │
│  │  Add ₹411 more for minimum order                   │  │
│  │                                                     │  │
│  │  [ Checkout                    → ]                  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Cart Actions:**

```
Cart Screen
    │
    ├── Tap "Add more items" ──────────► Returns to Menu Screen
    │
    ├── Tap [-] on an item ────────────► Quantity decreases by 1
    │                                    If qty reaches 0, item removed
    │                                    Prices recalculate
    │
    ├── Tap [+] on an item ────────────► Quantity increases by 1
    │                                    Prices recalculate
    │
    ├── Tap "Remove" on an item ───────► Item removed from cart
    │                                    Prices recalculate
    │
    ├── Tap "Checkout" (enabled) ──────► Proceeds to Checkout (see 3.5)
    │
    └── Tap "Checkout" (disabled) ─────► Toast: "Minimum order is ₹199"
         (below min order)                Shows gap amount needed
```

### 3.5 Checkout & Payment Flow

```
Tap "Checkout"
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  SCREEN: CHECKOUT                                       │
│  URL: /spice-garden/checkout                            │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  ←  Your order                                    │  │
│  │      Review & checkout                             │  │
│  ├───────────────────────────────────────────────────┤  │
│  │                                                     │  │
│  │  ┌─ Items ──────────────────────────────────────┐  │  │
│  │  │  Chicken Biryani            ₹550             │  │  │
│  │  │  Mutton Biryani             ₹550             │  │  │
│  │  │  Veg Spring Rolls (×2)      ₹360             │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │  ┌─ Order Summary ──────────────────────────────┐  │  │
│  │  │  Item total              ₹1,460              │  │  │
│  │  │  Packaging               ₹25                 │  │  │
│  │  │  Delivery                ₹30                 │  │  │
│  │  │  Taxes                   ₹74                 │  │  │
│  │  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─              │  │  │
│  │  │  To pay                  ₹1,589              │  │  │
│  │  │                                                │  │  │
│  │  │  [ Checkout & Pay        → ]                  │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Payment Sequence:**

```
Tap "Checkout & Pay"
       │
       ▼
┌─────────────────────────────────────┐
│  Client validates:                   │
│  ✓ Cart not empty                    │
│  ✓ Minimum order met                 │
│  ✓ Payment enabled (Razorpay)        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Frontend calls:                     │
│  storefront.initiatePayment          │
│  → { slug, lines[], address }        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Backend (tRPC):                     │
│  1. Validate restaurant is open      │
│  2. Validate items available         │
│  3. Validate prices match            │
│  4. Validate stock                   │
│  5. Calculate totals server-side     │
│  6. Create internal order (DRAFT)    │
│  7. Create Razorpay Order via API    │
│  8. Return: keyId, orderId, amount   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Frontend:                           │
│  1. Load Razorpay Checkout script    │
│  2. Open Razorpay Checkout overlay   │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Razorpay Checkout           │    │
│  │  ₹1,589                     │    │
│  │                              │    │
│  │  [UPI] [Card] [Netbanking]   │    │
│  │                              │    │
│  │  (customer completes pay)    │    │
│  │                              │    │
│  │  ✅ Payment successful       │    │
│  └─────────────────────────────┘    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Razorpay returns to frontend:       │
│  { razorpay_order_id,                │
│    razorpay_payment_id,              │
│    razorpay_signature }              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Frontend calls:                     │
│  storefront.verifyPayment            │
│  → { orderId, providerOrderId,      │
│      providerPaymentId, signature }  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Backend:                            │
│  1. Verify HMAC signature            │
│  2. If valid: mark PAYMENT_CONFIRMED │
│  3. Record payment details           │
│  4. Return success                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Frontend:                           │
│  Navigate to confirmation screen     │
│  /spice-garden/confirmation?order=X  │
└─────────────────────────────────────┘
```

### 3.6 Confirmation Screen

```
┌──────────────────────────────────────────┐
│  SCREEN: CONFIRMATION                    │
│  URL: /spice-garden/confirmation?order=X │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │              ✅                    │  │
│  │                                    │  │
│  │        Order confirmed!            │  │
│  │                                    │  │
│  │  Your order has been placed.       │  │
│  │  The kitchen is preparing          │  │
│  │  your food.                        │  │
│  │                                    │  │
│  │  [ Back to menu ]                  │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**Confirmation Actions:**

```
Confirmation Screen
    │
    └── Tap "Back to menu" ────────────► Returns to Menu Screen
                                         Cart is cleared
```

### 3.7 Order Tracking Flow

```
┌──────────────────────────────────────────┐
│  SCREEN: ORDER TRACKING                  │
│  URL: /spice-garden/order/:id            │
│                                          │
│  Order #SG-20260831-001                  │
│                                          │
│  ┌─ Status Timeline ─────────────────┐  │
│  │  ✅ Order placed     12:30 PM     │  │
│  │  ✅ Payment confirmed 12:31 PM     │  │
│  │  ✅ Kitchen accepted  12:33 PM     │  │
│  │  🔵 Preparing         12:35 PM     │  │
│  │  ○  Ready for pickup               │  │
│  │  ○  Out for delivery               │  │
│  │  ○  Delivered                      │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Items: Chicken Biryani (1), Mutton...   │
│  Payment: PAID ₹1,589                   │
│  Address: Home, Bengaluru               │
└──────────────────────────────────────────┘
```

### 3.8 Search Flow

```
Type in Search Bar
       │
       ▼
┌──────────────────────────────────────┐
│  Search state active                  │
│  300ms debounce                       │
│                                       │
│  Category pills → HIDDEN              │
│  Collections → HIDDEN                 │
│  Filter chips → VISIBLE               │
│                                       │
│  "Results for 'biryani'"  [Clear]     │
│                                       │
│  ┌──────────────────────────────┐     │
│  │  Chicken Biryani      ₹280  │     │
│  │  Mutton Biryani       ₹350  │     │
│  │  Veg Biryani          ₹220  │     │
│  │  3 dishes found             │     │
│  └──────────────────────────────┘     │
└──────────────────────────────────────┘
```

**Search Actions:**

```
Search
    │
    ├── Type query ─────────────────────► Filters items in real-time (debounced)
    │                                    Searches: name, description, category, tag
    │
    ├── Tap Filter Chip ────────────────► Further filters search results
    │
    ├── Tap "Clear" ────────────────────► Clears search query
    │                                    Returns to full menu view
    │                                    Category pills reappear
    │
    └── Empty results ──────────────────► Shows "no items found" message
```

### 3.9 Address Dialog Flow

```
Tap Delivery Address Bar
       │
       ▼
┌──────────────────────────────────────────┐
│  SCREEN: ADDRESS DIALOG                  │
│  (Modal overlay)                         │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  Delivery coverage           ✕    │  │
│  │                                    │  │
│  │  Service areas and address         │  │
│  │  selection will be configured      │  │
│  │  by the kitchen team.              │  │
│  │                                    │  │
│  │  📍 Delivery address selection     │  │
│  │  will activate once customer       │  │
│  │  sign-in is configured.            │  │
│  │                                    │  │
│  │  [ Close ]                         │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## 4. Admin Panel Flow

### 4.1 Admin Access Flow (First Visit)

```
Navigate to /admin
       │
       ▼
┌──────────────────────────────────────────┐
│  SCREEN: ADMIN ACCESS                    │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │           🔒                       │  │
│  │                                    │  │
│  │     Operations access only         │  │
│  │                                    │  │
│  │  Administrator passphrase          │  │
│  │  ┌──────────────────────────────┐  │  │
│  │  │ ••••••••••••••••••           │  │  │
│  │  └──────────────────────────────┘  │  │
│  │                                    │  │
│  │  [ Open operations ]               │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**Admin Access Actions:**

```
Admin Login
    │
    ├── Enter valid passphrase ────────► Session created
    │   + Tap "Open operations"           Page reloads
    │                                    Admin Dashboard loads
    │
    ├── Enter invalid passphrase ──────► Error toast: "Sign-in was not accepted"
    │                                    Red banner: "Sign-in was not accepted.
    │                                    Paste only the administrator passphrase."
    │
    └── Empty/short passphrase ────────► Button disabled (< 16 chars)
```

### 4.2 Admin Dashboard (Overview)

```
┌──────────────────────────────────────────────────────────────────┐
│  ADMIN DASHBOARD                                                  │
│                                                                   │
│  ┌─ Sidebar ──────────────┐  ┌─ Main Content ────────────────┐  │
│  │                         │  │                                │  │
│  │  🍛 Spice Garden        │  │  Kitchen desk · Spice Garden   │  │
│  │  OPERATIONS DESK        │  │  Today at a glance             │  │
│  │                         │  │                                │  │
│  │  KITCHEN STATUS         │  │  ┌──────┐ ┌──────┐ ┌──────┐  │  │
│  │  Ready to configure     │  │  │Today │ │Today │ │ Avg  │  │  │
│  │  Add your menu, then... │  │  │orders│ │sales │ │order │  │  │
│  │                         │  │  │  12  │ │₹8.4k│ │₹350 │  │  │
│  │  ─────────────────────  │  │  └──────┘ └──────┘ └──────┘  │  │
│  │                         │  │                                │  │
│  │  ☐ Overview ← active   │  │  Order pipeline                │  │
│  │  📋 Orders              │  │  Pending: 3  Preparing: 2     │  │
│  │  ✕ Menu                 │  │  Open: 5  Delivered: 8        │  │
│  │  ↑ Import menu          │  │  Cancelled: 1                 │  │
│  │  🎫 Coupons             │  │                                │  │
│  │  👥 Customers           │  │  Recent orders                 │  │
│  │  📊 Reports             │  │  ┌─────────────────────────┐  │  │
│  │  ⚙️ Restaurant          │  │  │ #SG-001  ₹450  New      │  │  │
│  │  🔗 Integrations        │  │  │ #SG-002  ₹320  Preparing│  │  │
│  │                         │  │  │ #SG-003  ₹580  Delivered│  │  │
│  │  ─────────────────────  │  │  └─────────────────────────┘  │  │
│  │  👤 -                   │  │                                │  │
│  │  - (user name)          │  │  ┌─ Quick Actions ─────────┐  │  │
│  │                         │  │  │ 📋 Manage orders         │  │  │
│  │                         │  │  │ ✕ Menu studio            │  │  │
│  │                         │  │  │ ⚠ Integrations           │  │  │
│  │                         │  │  └──────────────────────────┘  │  │
│  └─────────────────────────┘  └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 Admin Navigation Map

```
Admin Panel
    │
    ├── Overview ───────────────────────► Dashboard with KPIs + pipeline
    │
    ├── Orders ─────────────────────────► Order management table
    │   ├── Filter: All / Active / New / Preparing / Ready / Delivered / Cancelled
    │   ├── Order detail (inline)
    │   └── Status change dropdown
    │
    ├── Menu ───────────────────────────► Menu management
    │   ├── Add Item form (sidebar)
    │   └── Items list with availability controls
    │
    ├── Import Menu ────────────────────► CSV import workspace
    │   └── Upload → Preview → Validate → Import
    │
    ├── Coupons ────────────────────────► Coupon management
    │   ├── Create coupon form
    │   └── Active coupons list
    │
    ├── Customers ──────────────────────► (Planned: customer list + detail)
    │
    ├── Reports ────────────────────────► (Planned: analytics dashboard)
    │
    ├── Restaurant ─────────────────────► Restaurant settings
    │   ├── Identity (name, cuisine, color)
    │   ├── Fees (delivery, packaging, min order)
    │   ├── Toggles (accept orders, scheduled orders)
    │   └── Description
    │
    └── Integrations ───────────────────► Integration settings
        ├── Razorpay (Key ID, Secret, Webhook)
        └── Shadowfax (API Key, Merchant ID)
```

### 4.4 Order Management Flow

```
Tap "Orders" in sidebar
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  SCREEN: ORDER MANAGEMENT                                        │
│                                                                   │
│  ┌─ Filter Tabs ───────────────────────────────────────────┐    │
│  │ [All] [Active] [New] [Preparing] [Ready] [Delivered] [Cancelled]│
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─ Order Table ───────────────────────────────────────────┐    │
│  │ Order       │ Customer │ Payment │ Amount │ Status │ Action│    │
│  ├─────────────┼──────────┼─────────┼────────┼────────┼───────│    │
│  │ #SG-001     │ Rahul    │ PAID    │ ₹450   │ New    │ [▼]   │    │
│  │ 12:30 PM    │ 98765... │         │        │        │       │    │
│  ├─────────────┼──────────┼─────────┼────────┼────────┼───────│    │
│  │ #SG-002     │ Priya    │ PAID    │ ₹320   │ Prep.  │ [▼]   │    │
│  │ 12:15 PM    │ 87654... │         │        │        │       │    │
│  └─────────────┴──────────┴─────────┴────────┴────────┴───────┘    │
└──────────────────────────────────────────────────────────────────┘
```

**Order Status Actions:**

```
Status Dropdown [▼]
    │
    ├── "New order" ────────────────────► Status → PLACED
    │
    ├── "Accept" ───────────────────────► Status → RESTAURANT_ACCEPTED
    │
    ├── "Preparing" ───────────────────► Status → PREPARING
    │
    ├── "Ready" ────────────────────────► Status → READY_FOR_PICKUP
    │
    ├── "Request delivery" ─────────────► Status → DELIVERY_REQUESTED
    │                                    Triggers Shadowfax dispatch
    │
    ├── "Out for delivery" ─────────────► Status → OUT_FOR_DELIVERY
    │
    ├── "Delivered" ────────────────────► Status → DELIVERED
    │
    ├── "Reject" ───────────────────────► Status → REJECTED
    │                                    Triggers refund if payment was PAID
    │
    └── "Cancel" ───────────────────────► Status → CANCELLED
                                         Triggers refund if payment was PAID
```

### 4.5 Menu Management Flow

```
Tap "Menu" in sidebar
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  SCREEN: MENU MANAGEMENT                                         │
│                                                                   │
│  ┌─ Add Item Form ──────┐  ┌─ Items List ────────────────────┐  │
│  │ (dark panel, left)    │  │ (light panel, right)             │  │
│  │                       │  │                                   │  │
│  │ Add a dish            │  │ 🔍 Search menu items...          │  │
│  │ Make the menu yours   │  │                                   │  │
│  │                       │  │ ┌──────────────────────────────┐ │  │
│  │ Dish name:            │  │ │ V │ Chicken Biryani   ₹280  │ │  │
│  │ [________________]    │  │ │   │ Aromatic basmati... [▼]  │ │  │
│  │                       │  │ │   │ [ON] [Available ▼]       │ │  │
│  │ Price in ₹:           │  │ ├──────────────────────────────┤ │  │
│  │ [________________]    │  │ │ NV │ Mutton Biryani   ₹350  │ │  │
│  │                       │  │ │    │ Tender mutton...  [▼]   │ │  │
│  │ Choose category:      │  │ │    │ [ON] [Available ▼]      │ │  │
│  │ [Biryani        ▼]   │  │ ├──────────────────────────────┤ │  │
│  │                       │  │ │ V │ Veg Spring Rolls  ₹180  │ │  │
│  │ Dietary type:         │  │ │   │ Crispy...         [▼]    │ │  │
│  │ [Vegetarian      ▼]  │  │ │   │ [OFF] [Sold out ▼]      │ │  │
│  │                       │  │ └──────────────────────────────┘ │  │
│  │ [ + Add to menu ]     │  │                                   │  │
│  │                       │  │                     35 dishes    │  │
│  └───────────────────────┘  └───────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Menu Item Actions:**

```
Menu Management
    │
    ├── Fill form + "Add to menu" ──────► New item created
    │                                    Toast: "Menu item added"
    │                                    Item appears in list
    │
    ├── Toggle [ON/OFF] ───────────────► Item enabled/disabled
    │                                    Customers see/hide item immediately
    │
    ├── Select Availability ▼ ──────────► Changes item availability state
    │   ├── Available                     AVAILABLE → shown normally
    │   ├── Sold out                      SOLD_OUT → dimmed, "Sold out" badge
    │   ├── Later                         SCHEDULED_UNAVAILABLE → dimmed
    │   ├── Out of stock                  OUT_OF_STOCK → dimmed
    │   └── Hidden                        DISABLED → hidden from storefront
    │
    └── Type in Search ────────────────► Filters items by name in real-time
```

### 4.6 Coupons Management Flow

```
Tap "Coupons" in sidebar
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  SCREEN: COUPONS                                                  │
│                                                                   │
│  ┌─ Create Form ────────┐  ┌─ Active Offers ──────────────────┐ │
│  │                       │  │                                   │ │
│  │ New offer             │  │ Live offers                       │ │
│  │ Give guests a reason  │  │                                   │ │
│  │                       │  │ ┌──────────────────────────────┐ │ │
│  │ CODE:                 │  │ │ WELCOME50         [Live]     │ │ │
│  │ [WELCOME50_________]  │  │ │ ₹50 off on first order       │ │ │
│  │                       │  │ │ ₹50 off · Min ₹199           │ │ │
│  │ Offer description:    │  │ └──────────────────────────────┘ │ │
│  │ [₹50 off first...]   │  │                                   │ │
│  │                       │  │ ┌──────────────────────────────┐ │ │
│  │ [Flat ₹] [% off]     │  │ │ LUNCH20           [Live]     │ │ │
│  │ Discount:             │  │ │ 20% off on lunch orders      │ │ │
│  │ [50_____________]    │  │ │ 20% off · Min ₹250           │ │ │
│  │                       │  │ └──────────────────────────────┘ │ │
│  │ Minimum order in ₹:   │  │                                   │ │
│  │ [199_____________]    │  │                                   │ │
│  │                       │  │                                   │ │
│  │ [ 💾 Save offer ]     │  │                                   │ │
│  └───────────────────────┘  └───────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Coupon Actions:**

```
Coupons Panel
    │
    ├── Fill form + "Save offer" ───────► Coupon created
    │                                    Toast: "Coupon is live"
    │                                    Appears in active offers list
    │
    ├── Select "Flat (₹)" ──────────────► Discount input shows ₹ placeholder
    │
    └── Select "Percentage (%)" ────────► Discount input shows % placeholder
```

### 4.7 Restaurant Settings Flow

```
Tap "Restaurant" in sidebar
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  SCREEN: RESTAURANT SETTINGS                                      │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Restaurant identity & service                              │ │
│  │  How guests meet your kitchen                               │ │
│  │                                                              │ │
│  │  ┌──────────────────────┬──────────────────────┐           │ │
│  │  │ Restaurant name:     │ Cuisine line:         │           │ │
│  │  │ [Spice Garden    ]   │ [Indian • Biryani  ] │           │ │
│  │  ├──────────────────────┼──────────────────────┤           │ │
│  │  │ Primary color:       │ Preparation time:     │           │ │
│  │  │ [#C84630          ]  │ [25                ]  │           │ │
│  │  ├──────────────────────┼──────────────────────┤           │ │
│  │  │ Delivery fee (₹):    │ Packaging fee (₹):   │           │ │
│  │  │ [30                ] │ [25                 ] │           │ │
│  │  ├──────────────────────┴──────────────────────┤           │ │
│  │  │ Minimum order (₹):                          │           │ │
│  │  │ [199                                     ]   │           │ │
│  │  └─────────────────────────────────────────────┘           │ │
│  │                                                              │ │
│  │  Description:                                               │ │
│  │  ┌─────────────────────────────────────────────────────┐    │ │
│  │  │ Authentic North Indian cuisine...                    │    │ │
│  │  └─────────────────────────────────────────────────────┘    │ │
│  │                                                              │ │
│  │  [✓] Accept orders          [✓] Allow scheduled orders      │ │
│  │                                                              │ │
│  │  [ 💾 Save restaurant ]                                     │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

**Restaurant Settings Actions:**

```
Restaurant Settings
    │
    ├── Edit fields + "Save" ──────────► Settings saved
    │                                    Toast: "Restaurant settings saved"
    │                                    Affects storefront immediately
    │
    ├── Toggle "Accept orders" OFF ────► Restaurant marked closed
    │                                    Customers see "Restaurant is closed"
    │                                    No new orders accepted
    │
    ├── Toggle "Accept orders" ON ─────► Restaurant marked open
    │                                    Customers can order again
    │
    ├── Toggle "Allow scheduled orders"► Enables/disables scheduled ordering
    │
    └── "View storefront" button ──────► Opens storefront in new tab
```

### 4.8 Integration Settings Flow

```
Tap "Integrations" in sidebar
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  SCREEN: INTEGRATION SETTINGS                                     │
│                                                                   │
│  ┌─ Razorpay ──────────────────────────────────────────────┐    │
│  │  Payment Provider                                        │    │
│  │                                                          │    │
│  │  Status: 🟢 Connected  /  🔴 Not configured             │    │
│  │                                                          │    │
│  │  Mode: [Sandbox ○] [Live ●]                             │    │
│  │                                                          │    │
│  │  Key ID:    [rzp_live_xxxxx              ]              │    │
│  │  Key Secret: [••••••••••••                ]              │    │
│  │  Webhook:    [••••••••••••                ]              │    │
│  │                                                          │    │
│  │  [ Test Connection ]  [ Save Credentials ]               │    │
│  │                                                          │    │
│  │  Webhook URL (configure in Razorpay dashboard):          │    │
│  │  https://9housekitchen.in/api/trpc/storefront.           │    │
│  │       razorpayWebhook                                    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─ Shadowfax ─────────────────────────────────────────────┐    │
│  │  Delivery Provider                                       │    │
│  │                                                          │    │
│  │  Status: 🟢 Connected  /  🔴 Not configured             │    │
│  │                                                          │    │
│  │  API Key:     [••••••••••••               ]              │    │
│  │  Merchant ID: [••••••••                   ]              │    │
│  │  Webhook:     [••••••••••••               ]              │    │
│  │                                                          │    │
│  │  [ Test Connection ]  [ Save Credentials ]               │    │
│  │                                                          │    │
│  │  Webhook URL:                                             │    │
│  │  https://9housekitchen.in/api/trpc/storefront.           │    │
│  │       shadowfaxWebhook                                   │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Authentication Flow

### 5.1 Admin Login

```
┌─────────────────────────────────────────────────────────┐
│  AUTHENTICATION FLOW                                     │
│                                                          │
│  User visits /admin                                     │
│       │                                                  │
│       ▼                                                  │
│  Check session (cookie)                                 │
│       │                                                  │
│       ├── Session valid + role=admin ──► Admin Dashboard │
│       │                                                  │
│       ├── Session invalid/missing ──────► Login Screen   │
│       │                                  │               │
│       │                                  ├── Enter token │
│       │                                  │               │
│       │                                  ├── POST /auth  │
│       │                                  │   .localAdmin │
│       │                                  │   Login       │
│       │                                  │               │
│       │                                  ├── Token valid?│
│       │                                  │   ├── Yes →   │
│       │                                  │   │  Set      │
│       │                                  │   │  cookie   │
│       │                                  │   │  Reload   │
│       │                                  │   │  page     │
│       │                                  │   └── No →    │
│       │                                  │      Error    │
│       │                                  │      toast    │
│       │                                  │      + red    │
│       │                                  │      banner   │
│       │                                                  │
│       └── role != admin ───────────────► Access Denied   │
│                                                          │
│  Logout:                                                 │
│  POST /auth.logout → Clear cookie → Redirect to /        │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Customer Checkout (Guest)

```
┌─────────────────────────────────────────────────────────┐
│  GUEST CHECKOUT FLOW                                     │
│                                                          │
│  Current implementation:                                 │
│  - No customer sign-in required                          │
│  - Address is hardcoded ("To be confirmed")              │
│  - Payment is the only validation gate                   │
│                                                          │
│  Future (planned):                                       │
│  - OTP-based phone verification                          │
│  - Saved address book                                    │
│  - Customer profile auto-creation                        │
│  - Loyalty tracking                                      │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Order Lifecycle Flow

### 6.1 Complete Order Journey (Kitchen + Customer)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ORDER LIFECYCLE — Full Journey                                      │
│                                                                      │
│  CUSTOMER SIDE            KITCHEN SIDE           SYSTEM SIDE         │
│  ─────────────            ─────────────           ──────────         │
│                                                                      │
│  1. Browse menu                                                    │
│  2. Add items to cart                                               │
│  3. Customize items                                                 │
│  4. Review cart                                                     │
│  5. Checkout                                                        │
│  6. Pay via Razorpay ──► 7. Order appears      8. Payment verified │
│                             in queue                                  │
│                          9. Accept order ─────► 10. Status updated  │
│                                                  + audit logged     │
│                         11. Start preparing ──► 12. Timer starts   │
│                                                  prep countdown    │
│                         13. Mark ready ────────► 14. Delivery      │
│                                                  dispatch possible │
│                         15. Request delivery ──► 16. Shadowfax     │
│                                                  delivery created  │
│                                                                    │
│  17. Rider assigned ◄────────────────────────── 18. Webhook update│
│  18. Rider picked up ◄────────────────────────── 19. Webhook      │
│  19. Out for delivery ◄───────────────────────── 20. Webhook      │
│                                                                      │
│  20. Order delivered! ◄───────────────────────── 21. Webhook       │
│                                                                      │
│  (or if issues:)                                                     │
│  20. Order cancelled ◄──── Admin cancels ──────── Refund initiated │
│  21. Refund processed ◄─── Razorpay refund ────── Status updated  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 State Transition Map

```
PENDING_PAYMENT ──────────────────────────────────────────────────┐
    │                                                              │
    ├── PAYMENT_CONFIRMED ──► PLACED ──► RESTAURANT_ACCEPTED      │
    │                                          │                   │
    ├── PAYMENT_FAILED (terminal)              ▼                   │
    │                                     PREPARING                │
    └── CANCELLED (terminal)                     │                  │
                                                ▼                  │
                                         READY_FOR_PICKUP          │
                                                │                  │
                                                ▼                  │
                                         DELIVERY_REQUESTED        │
                                                │                  │
                                                ▼                  │
                                         RIDER_ASSIGNED            │
                                                │                  │
                                                ▼                  │
                                         PICKED_UP                 │
                                                │                  │
                                                ▼                  │
                                         OUT_FOR_DELIVERY          │
                                                │                  │
                                                ▼                  │
                                          DELIVERED ◄──────────────┘
                                                │
                                                ├──► REFUND_PENDING
                                                │         │
                                                │         ▼
                                                │    REFUNDED
                                                │
                                          (terminal)

REJECTED ◄── (from PLACED)
    │
    └──► REFUND_PENDING
              │
              ▼
         REFUNDED
```

### 6.3 Admin Order State Actions

```
┌─────────────────┬──────────────────────────┬──────────────────────────┐
│ Current State   │ Admin Action             │ Next State               │
├─────────────────┼──────────────────────────┼──────────────────────────┤
│ PLACED          │ Accept                   │ RESTAURANT_ACCEPTED      │
│ PLACED          │ Reject                   │ REJECTED                 │
│ PLACED          │ Cancel                   │ CANCELLED                │
│ RESTAURANT_     │ Start preparing          │ PREPARING                │
│   ACCEPTED      │ Cancel                   │ CANCELLED                │
│ PREPARING       │ Mark ready               │ READY_FOR_PICKUP         │
│ PREPARING       │ Cancel                   │ CANCELLED                │
│ READY_FOR_      │ Request delivery         │ DELIVERY_REQUESTED       │
│   PICKUP        │ Cancel                   │ CANCELLED                │
│ DELIVERY_       │ (auto: Shadowfax assigns)│ RIDER_ASSIGNED           │
│   REQUESTED     │ Cancel                   │ CANCELLED                │
│ RIDER_ASSIGNED  │ (auto: Shadowfax pickup) │ PICKED_UP                │
│ PICKED_UP       │ (auto: Shadowfax enroute)│ OUT_FOR_DELIVERY         │
│ OUT_FOR_        │ (auto: Shadowfax deliver)│ DELIVERED                │
│   DELIVERY      │                          │                          │
│ DELIVERED       │ Initiate refund          │ REFUND_PENDING           │
│ REJECTED        │ Initiate refund          │ REFUND_PENDING           │
│ CANCELLED       │ Initiate refund          │ REFUND_PENDING           │
│ REFUND_PENDING  │ (auto: Razorpay confirm) │ REFUNDED                 │
└─────────────────┴──────────────────────────┴──────────────────────────┘
```

---

## 7. Payment Flow

### 7.1 Razorpay Integration States

```
┌─────────────────────────────────────────────────────────────────┐
│  PAYMENT STATES                                                  │
│                                                                   │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   CREATED    │────►│ AUTHORIZED   │────►│  CAPTURED    │    │
│  └──────┬───────┘     └──────┬───────┘     └──────────────┘    │
│         │                     │                                  │
│         │                     ▼                                  │
│         │              ┌──────────────┐                         │
│         │              │   FAILED     │                         │
│         │              └──────────────┘                         │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │  CANCELLED   │                                                │
│  └──────────────┘                                                │
│                                                                   │
│  Refund lifecycle:                                               │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   PENDING    │────►│  PROCESSED   │     │   FAILED     │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Webhook Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  RAZORPAY WEBHOOK                                                │
│                                                                   │
│  Razorpay POSTs to:                                              │
│  https://9housekitchen.in/api/trpc/storefront.razorpayWebhook   │
│                                                                   │
│  1. Receive HTTP request                                         │
│  2. Verify HMAC signature (RAZORPAY_WEBHOOK_SECRET)             │
│  3. Check idempotency (webhook_events table)                    │
│     ├── Event already processed → Skip, return 200             │
│     └── New event → Continue                                    │
│  4. Parse event type                                            │
│  5. Process based on type:                                      │
│     ├── payment.captured → Update order to PAYMENT_CONFIRMED   │
│     ├── payment.failed → Update order to PAYMENT_FAILED        │
│     ├── refund.created → Update refund to PENDING              │
│     ├── refund.processed → Update refund to PROCESSED          │
│     └── refund.failed → Update refund to FAILED                │
│  6. Mark event as processed                                     │
│  7. Return 200 OK                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Refund Flow

```
Admin taps "Cancel" or "Refund" on an order
       │
       ▼
┌─────────────────────────────────────┐
│  Backend validates:                  │
│  ✓ Order exists and is paid          │
│  ✓ Order is in cancellable state     │
│  ✓ Admin has finance permissions     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Create refund record                │
│  Status: PENDING                     │
│  Order status: REFUND_PENDING        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Call Razorpay Refunds API           │
│  POST /payments/:id/refund           │
│  { amount, reason, notes }           │
└──────────────┬──────────────────────┘
               │
               ├──► Success ──► Refund record: PROCESSED
               │                Order: REFUNDED
               │
               └──► Failure ──► Refund record: FAILED
                                Admin notification
                                Manual retry needed
```

---

## 8. Delivery Flow

### 8.1 Shadowfax Delivery Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  DELIVERY FLOW                                                    │
│                                                                   │
│  Kitchen marks order READY_FOR_PICKUP                            │
│       │                                                          │
│       ▼                                                          │
│  Admin taps "Request delivery"                                   │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────────────────────────┐                           │
│  │  Backend calls Shadowfax API:     │                           │
│  │  POST /create_delivery            │                           │
│  │  { pickup, drop, order details }  │                           │
│  └──────────────┬───────────────────┘                           │
│                  │                                                │
│                  ▼                                                │
│  ┌──────────────────────────────────┐                           │
│  │  Shadowfax returns:               │                           │
│  │  { delivery_id, tracking_id,      │                           │
│  │    estimated_pickup/drop }        │                           │
│  └──────────────┬───────────────────┘                           │
│                  │                                                │
│                  ▼                                                │
│  ┌──────────────────────────────────┐                           │
│  │  Status updates via webhooks:     │                           │
│  │                                    │                           │
│  │  rider_assigned ──────────────►   │                           │
│  │  picked_up ───────────────────►   │                           │
│  │  out_for_delivery ────────────►   │                           │
│  │  delivered ───────────────────►   │                           │
│  │                                    │                           │
│  │  Each webhook:                     │                           │
│  │  1. Verify signature               │                           │
│  │  2. Check idempotency              │                           │
│  │  3. Update delivery record         │                           │
│  │  4. Update order status            │                           │
│  │  5. Store rider info if provided   │                           │
│  │  6. Return 200                     │                           │
│  └──────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Delivery Status Mapping

```
┌──────────────────────┬────────────────────────┬──────────────────┐
│ Shadowfax Status     │ Internal Status        │ Order Status     │
├──────────────────────┼────────────────────────┼──────────────────┤
│ (creation request)   │ PENDING                │ DELIVERY_        │
│                      │                        │   REQUESTED      │
├──────────────────────┼────────────────────────┼──────────────────┤
│ rider_assigned       │ RIDER_ASSIGNED         │ RIDER_ASSIGNED   │
├──────────────────────┼────────────────────────┼──────────────────┤
│ picked_up            │ PICKED_UP              │ PICKED_UP        │
├──────────────────────┼────────────────────────┼──────────────────┤
│ out_for_delivery     │ OUT_FOR_DELIVERY       │ OUT_FOR_DELIVERY │
├──────────────────────┼────────────────────────┼──────────────────┤
│ delivered            │ DELIVERED              │ DELIVERED        │
├──────────────────────┼────────────────────────┼──────────────────┤
│ cancelled / failed   │ FAILED                 │ Manual review    │
└──────────────────────┴────────────────────────┴──────────────────┘
```

---

## 9. Screen Inventory

### 9.1 Customer Screens

| # | Screen | Route | Key Elements | User Actions |
|---|--------|-------|-------------|-------------|
| C1 | Menu/Home | `/` `/spice-garden` | TopBar, Hero, Address bar, Search, Categories, Collections, Menu items, Mobile cart bar, Desktop cart sidebar | Browse, search, filter, add items, customize, view cart |
| C2 | Customization Drawer | (overlay on C1) | Size selector, Extras, Special instructions, Quantity, Add button | Select options, add to cart |
| C3 | Cart | `/spice-garden/cart` | Item list with quantities, Price breakdown, Checkout button | Adjust quantities, remove items, checkout |
| C4 | Checkout | `/spice-g Razorpay checkout` | Item summary, Price breakdown, Payment button | Review order, initiate payment |
| C5 | Confirmation | `/spice-garden/confirmation` | Success checkmark, Order number, Back to menu button | View confirmation, return to menu |
| C6 | Order Tracking | `/spice-garden/order/:id` | Status timeline, Order details, Items, Payment status | View order progress |
| C7 | Address Dialog | (overlay on any) | Delivery coverage info | View/close |

### 9.2 Admin Screens

| # | Screen | Route | Key Elements | User Actions |
|---|--------|-------|-------------|-------------|
| A1 | Admin Login | `/admin` (unauthed) | Passphrase input, Submit button | Authenticate |
| A2 | Dashboard | `/admin` | KPI cards, Pipeline, Recent orders, Quick actions, Restaurant status card | View metrics, navigate to sections |
| A3 | Order Management | `/admin/orders` | Filter tabs, Order table, Status dropdowns | Filter orders, change status, cancel |
| A4 | Menu Management | `/admin/menu` | Add item form, Item list, Search, Availability controls, ON/OFF toggles | Create items, toggle availability |
| A5 | Import Menu | `/admin/import` | CSV upload, Preview table, Validation, Import button | Upload, validate, import menu |
| A6 | Coupons | `/admin/coupons` | Create form, Active offers list | Create coupons, view active |
| A7 | Restaurant Settings | `/admin/restaurant` | Identity fields, Fee fields, Toggles, Description | Edit settings, save |
| A8 | Integrations | `/admin/integrations` | Razorpay config, Shadowfax config, Status indicators | Configure credentials, test connection |

---

## 10. State Diagrams

### 10.1 Cart State

```
┌──────────────┐         ┌──────────────┐
│   EMPTY      │────────►│   HAS_ITEMS  │
│              │ add item│              │
│  - No bar    │◄────────│  - Bar shown │
│  - No sidebar│ rm all  │  - Sidebar   │
└──────────────┘         │    shown     │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │  CHECKING    │
                         │              │
                         │  - Validate  │
                         │  - Create    │
                         │    order     │
                         │  - Razorpay  │
                         └──────┬───────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           │           ▼
            ┌──────────────┐   │   ┌──────────────┐
            │ PAYMENT_OPEN │   │   │   PAYMENT    │
            │              │   │   │   FAILED     │
            │  - Razorpay  │   │   │              │
            │    overlay   │   │   │  - Error msg │
            └──────┬───────┘   │   └──────────────┘
                   │           │
                   ▼           │
            ┌──────────────┐   │
            │  CONFIRMED   │   │
            │              │   │
            │  - Navigate  │   │
            │    to conf.  │   │
            │  - Cart      │   │
            │    cleared   │   │
            └──────────────┘   │
                               │
            ┌──────────────┐   │
            │  DISMISSED   │◄──┘
            │              │
            │  - Back to   │
            │    menu      │
            │  - Cart kept │
            └──────────────┘
```

### 10.2 Admin Panel State

```
┌──────────────┐
│  UNAUTHED    │
│              │
│  Shows login │──── valid token ────►┌──────────────┐
│              │                      │  AUTHENTICATED│
└──────────────┘                      │              │
                                      │  Sidebar     │
                                      │  visible     │
                                      └──────┬───────┘
                                             │
                              ┌──────────────┼──────────────┐──────────────┐
                              ▼              ▼              ▼              ▼
                      ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
                      │  OVERVIEW    │ │  ORDERS  │ │   MENU   │ │ COUPONS  │
                      │  (default)   │ │          │ │          │ │          │
                      └──────────────┘ └──────────┘ └──────────┘ └──────────┘
                                              │
                              ┌────────────────┼────────────────┐
                              ▼                ▼                ▼
                      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                      │  RESTAURANT  │ │ INTEGRATIONS │ │    IMPORT    │
                      │  SETTINGS    │ │              │ │              │
                      └──────────────┘ └──────────────┘ └──────────────┘
```

---

## 11. Error & Edge Case Flows

### 11.1 Restaurant Closed

```
Customer visits storefront
       │
       ▼
┌──────────────────────────────────────┐
│  Restaurant.isOpen = false           │
│                                      │
│  Hero banner shows:                  │
│  "Currently closed"                  │
│  "Opens at 11:00 AM"                │
│                                      │
│  Menu items: All hidden or dimmed    │
│  Cart: Checkout button disabled      │
│  Toast on add: "Restaurant closed"   │
└──────────────────────────────────────┘
```

### 11.2 Item Sold Out

```
Customer taps "ADD" on sold-out item
       │
       ▼
┌──────────────────────────────────────┐
│  Item.availability = SOLD_OUT        │
│                                      │
│  Item card:                          │
│  - Dimmed (opacity 70%)             │
│  - "Sold out" overlay on image       │
│  - Button shows "Unavailable"        │
│  - Button disabled                   │
│  - No click action                   │
└──────────────────────────────────────┘
```

### 11.3 Below Minimum Order

```
Customer tries to checkout with total < minimum order
       │
       ▼
┌──────────────────────────────────────┐
│  grandTotal < restaurant.minOrder    │
│                                      │
│  Checkout button: DISABLED           │
│  Message: "Add ₹X more for          │
│            minimum order"            │
│  Minimum order: ₹199                │
│  Current total: ₹145                │
│  Gap: ₹54                           │
└──────────────────────────────────────┘
```

### 11.4 Payment Failure

```
Razorpay payment fails
       │
       ▼
┌──────────────────────────────────────┐
│  Frontend:                           │
│  - Razorpay modal shows error        │
│  - ondismiss callback fires          │
│  - processing state cleared          │
│  - User returned to checkout         │
│                                      │
│  Order remains: PENDING_PAYMENT      │
│  Payment remains: CREATED (failed)   │
│                                      │
│  Customer can:                       │
│  - Try payment again                 │
│  - Edit cart and retry               │
│  - Leave (order auto-expires)        │
└──────────────────────────────────────┘
```

### 11.5 Payment Not Configured

```
Razorpay keys not set
       │
       ▼
┌──────────────────────────────────────┐
│  storefront.paymentConfig returns:   │
│  { enabled: false }                  │
│                                      │
│  Customer taps "Checkout":           │
│  Toast error:                        │
│  "Online payments are not configured │
│   yet. The restaurant administrator  │
│   can activate Razorpay from the     │
│   integrations settings."            │
│                                      │
│  Razorpay Checkout never opens       │
└──────────────────────────────────────┘
```

### 11.6 Empty Menu

```
No items in database
       │
       ▼
┌──────────────────────────────────────┐
│  MenuStream receives empty items[]   │
│                                      │
│  Shows:                              │
│  🍽️ (utensils icon)                  │
│  "The menu is being prepared"        │
│  "The kitchen team will publish      │
│   dishes shortly."                   │
└──────────────────────────────────────┘
```

### 11.7 Admin Dashboard Load Failure

```
Dashboard query fails
       │
       ▼
┌──────────────────────────────────────┐
│  dashboard.isError = true            │
│                                      │
│  Shows:                              │
│  "We couldn't load the restaurant    │
│   workspace. Please retry."          │
│  (red error message)                 │
└──────────────────────────────────────┘
```

### 11.8 Network / API Error

```
tRPC request fails
       │
       ▼
┌──────────────────────────────────────┐
│  Toast notification:                 │
│  Title: Error message                │
│  Description: Technical details      │
│                                      │
│  User action:                        │
│  - Retry the failed action           │
│  - Check network connection          │
│  - Contact support                   │
└──────────────────────────────────────┘
```

---

## Appendix A: Screen Transition Matrix

```
FROM ↓ \ TO →   │ Menu │ Cart │ Checkout │ Confirm │ Track │ Admin │ Login │
─────────────────┼──────┼──────┼──────────┼─────────┼───────┼───────┼───────┤
Menu            │  —   │  ✓   │    ✓     │    ✗    │   ✗   │   ✗   │   ✗   │
Cart            │  ✓   │  —   │    ✓     │    ✗    │   ✗   │   ✗   │   ✗   │
Checkout        │  ✓   │  ✓   │    —     │    ✓    │   ✗   │   ✗   │   ✗   │
Confirmation    │  ✓   │  ✗   │    ✗     │    —    │   ✗   │   ✗   │   ✗   │
Order Tracking  │  ✓   │  ✗   │    ✗     │    ✗    │   —   │   ✗   │   ✗   │
Admin (unauth)  │  ✗   │  ✗   │    ✗     │    ✗    │   ✗   │   ✗   │   ✓   │
Admin (auth)    │  ✓*  │  ✗   │    ✗     │    ✗    │   ✗   │   —   │   ✗   │
Admin Login     │  ✗   │  ✗   │    ✗     │    ✗    │   ✗   │   ✓   │   —   │

✓ = navigates   ✗ = no navigation   ✓* = opens storefront in new tab
```

---

## Appendix B: Component Hierarchy

```
App
├── ErrorBoundary
│   └── ThemeProvider
│       └── TooltipProvider
│           └── Toaster
│           └── Router
│               ├── Route "/" → Home → OrderingApp
│               │   ├── TopBar
│               │   ├── Hero Banner
│               │   ├── Delivery Address Bar
│               │   ├── Address Dialog
│               │   ├── Offer Banner
│               │   ├── Category Sidebar (desktop)
│               │   ├── Category Pills (mobile)
│               │   ├── Search Bar
│               │   ├── Filter Chips
│               │   ├── Collections
│               │   ├── MenuStream
│               │   │   └── MenuCard (×N)
│               │   ├── CartTicket (desktop sidebar)
│               │   ├── MobileCartBar
│               │   ├── CustomizationDrawer
│               │   │   └── OptionGroup (×2)
│               │   │   └── Quantity
│               │   └── ServiceSetupScreen
│               │       ├── Cart view
│               │       ├── Checkout view
│               │       └── Confirmation view
│               │
│               ├── Route "/admin" → Admin
│               │   ├── AdminAccess (login)
│               │   └── DashboardLayout
│               │       ├── Sidebar
│               │       └── AdminWorkspace
│               │           ├── OverviewPanel
│               │           │   ├── KPI Cards
│               │           │   ├── Pipeline
│               │           │   ├── Recent Orders
│               │           │   ├── Restaurant Status Card
│               │           │   └── Quick Actions
│               │           ├── OrdersPanel
│               │           │   ├── Filter Tabs
│               │           │   └── Order Table
│               │           ├── MenuPanel
│               │           │   ├── Add Item Form
│               │           │   └── Items List
│               │           ├── CouponsPanel
│               │           │   ├── Create Form
│               │           │   └── Active Offers
│               │           ├── RestaurantPanel
│               │           │   ├── Identity Fields
│               │           │   ├── Fee Fields
│               │           │   └── Toggles
│               │           └── IntegrationPanel
│               │               ├── Razorpay Config
│               │               └── Shadowfax Config
│               │
│               └── Route "/admin/import" → MenuImportWorkspace
│                   └── MenuImportPanel
│                       ├── Upload area
│                       ├── Preview table
│                       └── Import button
```

---

*Document generated for 9House Kitchen — Cloud-Kitchen Ordering Platform*  
*Covers all customer-facing and admin-facing screen transitions and user journeys*
