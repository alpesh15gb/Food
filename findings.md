# Security & Logic Audit: Onboarding to Payout

**Date:** 2026-09-01
**Scope:** Full platform audit — auth, onboarding, checkout, payments, Razorpay Route, delivery, inventory, KDS, notifications, tenant isolation
**Auditors:** Automated deep-scan across all server routers, integrations, schema, and client gates

---

## Executive Summary

| Severity | Count | Top Themes |
|----------|-------|------------|
| CRITICAL | 10 | Cross-tenant data leaks, webhook signature bypass, refund fraud, hardcoded JWT secret, registration race condition |
| HIGH | 17 | Missing tenant isolation on mutations, fail-open permissions, state machine violations, XSS in invoices, loyalty double-spend |
| MEDIUM | 23 | DoS via unbounded queries, CSRF gaps, coupon TOCTOU, tax calculation errors, partial refund mishandling |
| LOW | 12 | Schema design gaps, info disclosure, ID collision risk, dev fallbacks |

**Total findings: 62**

---

## CRITICAL Findings (Fix Immediately)

### C-01: Webhook Signature Verification Bypass When Secret Unset
- **File:** `server/integrations/razorpay.ts:317-325`
- **Category:** Payment Fraud
- The HMAC check is conditional: `if (webhookSecret && signature)`. If `RAZORPAY_WEBHOOK_SECRET` is empty/unset, ALL webhooks are accepted without verification. An attacker can forge `payment.captured` events to confirm orders without paying.
- **Fix:** Reject all webhooks when secret is missing. Make verification mandatory.

### C-02: Synthetic Signature Passed to confirmPayment() From Webhook
- **File:** `server/integrations/razorpay.ts:368-374`
- **Category:** Authentication Bypass
- Webhook handler calls `confirmPayment()` with `signature: "webhook_verified"` — a dummy string that will always fail HMAC validation inside `confirmPayment()`. This means webhook-based payment confirmation is effectively broken; only browser callback works. If someone later "fixes" this without understanding the dual-path design, they could introduce a bypass.
- **Fix:** Add a `preVerified: boolean` parameter to `confirmPayment()` that skips signature check only when called from an already-verified webhook context.

### C-03: No Refund Amount Validation Against Original Payment
- **File:** `server/integrations/razorpay.ts:528-582`, `server/routers/admin.ts:761-782`
- **Category:** Refund Fraud
- `initiateRefund()` accepts arbitrary `amountPaise` without checking: (a) it doesn't exceed original payment, (b) cumulative refunds don't exceed payment, (c) payment is in CAPTURED status. A compromised admin can refund more than was paid.
- **Fix:** Validate `amountPaise + sum(existing_refunds) <= payment.amountPaise` and `payment.status === 'CAPTURED'` before calling Razorpay API.

### C-04: Hardcoded Development JWT/Cookie Secrets
- **File:** `server/_core/env.ts:6-7`
- **Category:** Cryptographic Weakness
- `jwtSecret` and `cookieSecret` fall back to well-known strings (`"dev-jwt-secret-change-in-production"`) when env vars are missing. If deployed without setting these, any attacker who reads source code can forge admin sessions.
- **Fix:** Remove fallbacks. Fail fast at startup if secrets are not configured. Rotate immediately if deployed with defaults.

### C-05: Registration Race Condition — Duplicate Accounts
- **File:** `server/routers.ts:80-97`
- **Category:** Race Condition / TOCTOU
- Email uniqueness check (SELECT) and user creation (INSERT) are not atomic. No UNIQUE constraint on `users.email`. Two concurrent registrations with same email both succeed, creating duplicate accounts.
- **Fix:** Add unique index on `users.email` (non-null). Wrap check-and-insert in transaction with `SELECT ... FOR UPDATE`.

### C-06: No Rate Limiting on Login/Register Endpoints
- **File:** `server/routers.ts:65-158`
- **Category:** Brute Force
- Zero rate limiting on `auth.login` and `auth.register`. Rate limiters exist in `server/security/rateLimit.ts` but are only applied to OTP endpoints, not email/password auth.
- **Fix:** Apply IP-based and per-email rate limiting. Implement account lockout after N failures.

### C-07: KDS Cross-Tenant Data Leak — All Orders Exposed
- **File:** `server/routers/kds.ts:5-39`
- **Category:** Cross-Tenant Data Leak
- `getActiveOrders` has optional `slug`. When omitted, returns ALL active orders from ALL restaurants — customer names, phones, addresses, items visible to any admin.
- **Fix:** Make slug/restaurantId required. Always filter by `eq(orders.restaurantId, ...)`.

### C-08: Customer List Returns All Tenants' PII
- **File:** `server/db.ts:1307-1347`, `server/routers/admin.ts:360-365`
- **Category:** Cross-Tenant Data Leak / PII Exposure
- `customers` procedure never passes `restaurantId` to `getCustomerList()`. Returns ALL customer profiles system-wide including phone, email, spending data.
- **Fix:** Always pass `ctx.restaurantId`. Make restaurantId a mandatory filter in the DB function.

### C-09: Customer Detail Has No Tenant Isolation
- **File:** `server/routers/admin.ts:367-368`, `server/db.ts:1349-1381`
- **Category:** Cross-Tenant Data Leak / PII Exposure
- `customerDetail` takes only `customerId`, returns full PII for any customer regardless of tenant. Admin from Restaurant A can read Restaurant B's customer data.
- **Fix:** Verify customer has orders with the calling tenant's restaurant before returning data.

### C-10: Delivery Webhook Signature Verification Is a No-Op
- **File:** `server/integrations/shadowfax.ts:235-267`
- **Category:** Webhook Spoofing
- Comment says "HMAC verification would go here" but there is NO actual verification code. Combined with `shadowfaxWebhook` being a `publicProcedure`, anyone can inject arbitrary delivery status updates.
- **Fix:** Implement HMAC-SHA256 verification. Reject payloads with invalid/missing signatures.

---

## HIGH Findings (Fix This Sprint)

### H-01: tenantProcedure Does Not Verify User Membership
- **File:** `server/_core/trpc.ts:51-61`
- Resolves restaurantId from domain/slug but never checks if the user is actually a member. Any admin-role user can access any restaurant's data.
- **Fix:** Query `restaurantMembers` for current user + resolved restaurantId. Reject if no active membership.

### H-02: requirePermission Silently Allows Access on Error (Fail-Open)
- **File:** `server/_core/trpc.ts:131-134`
- Catch block swallows all non-TRPCError exceptions and falls through to grant access. Any DB error = full access.
- **Fix:** Fail-closed. Re-throw unexpected errors or return FORBIDDEN. Only allow specific migration table-not-found errors.

### H-03: Default Session Expiry Is One Year
- **File:** `server/_core/sdk.ts:190`, `shared/const.ts:2`
- `signSession()` defaults to 365 days. Cookie maxAge is 12 hours, but JWT remains valid for a year. Leaked Bearer tokens provide long-lived access.
- **Fix:** Pass explicit shorter `expiresInMs` matching cookie maxAge. Reduce default from ONE_YEAR_MS.

### H-04: Every Registrant Gets Global role="admin"
- **File:** `server/routers.ts:95`
- Public signup creates users with `role: "admin"`, granting admin panel access to every registrant. Combined with H-01, any registered user can access any restaurant.
- **Fix:** Set global role to `"user"` on registration. Rely on `restaurantMembers.role` for admin access within a tenant.

### H-05: Logout Does Not Invalidate JWT
- **File:** `server/routers.ts:161-167`
- Clears cookie but JWT remains valid until expiry. No session revocation mechanism.
- **Fix:** Implement session blacklist or switch to opaque server-side sessions. At minimum, reduce JWT lifetime.

### H-06: State Machine Violation — confirmPayment Skips PAYMENT_CONFIRMED
- **File:** `server/integrations/razorpay.ts:282`, `server/domain/orderStateMachine.ts:42`
- Sets status directly to "PLACED", skipping "PAYMENT_CONFIRMED". Code relying on PAYMENT_CONFIRMED triggers will never fire.
- **Fix:** Align with state machine. Either use PAYMENT_CONFIRMED first or update the state machine definition.

### H-07: Idempotency Key Ignored in Checkout
- **File:** `server/routers/storefront.ts:56-57, 282-317`
- Input schema includes `idempotencyKey` but it's never passed to or used by `createOrderFromValidatedCart()`. Double-click creates duplicate orders.
- **Fix:** Store key on orders table. Check for existing orders with same key before inserting.

### H-08: Manual Order Accepts Client-Supplied totalPaise
- **File:** `server/routers/admin.ts:1154-1212`
- Unlike storefront (server-side pricing), manual orders trust admin-supplied total. Item prices are free-form, not resolved from catalog.
- **Fix:** Calculate total from submitted items server-side. Validate against item sum.

### H-09: Invoice HTML Contains XSS Vectors
- **File:** `server/domain/invoiceGenerator.ts:34-137`
- User-supplied data (restaurant name, customer name, item names) interpolated directly into HTML without escaping. Script injection via crafted names.
- **Fix:** HTML-escape all interpolated values before embedding in template.

### H-10: SMS Adapter Leaks API Key in URL
- **File:** `server/integrations/whatsapp.ts:82`
- MSG91 auth key in GET query string. Appears in server logs, proxy logs, network monitoring.
- **Fix:** Use POST with body parameters. Pass auth key in HTTP header.

### H-11: Inventory Stock Can Go Negative
- **File:** `server/routers/inventory.ts:72-132`
- `recordWastage` and `adjustStock` use raw SQL arithmetic without checking sufficiency. No CHECK constraint prevents negative stock.
- **Fix:** Add `CHECK (current_stock >= 0)` constraint. Read-validate-update atomically in transaction.

### H-12: Loyalty Point Redemption Race Condition (Double-Spend)
- **File:** `server/routers/loyalty.ts:138-181`
- Classic TOCTOU: read balance → check sufficiency → deduct. Two concurrent requests both pass check, both deduct, resulting in negative balance.
- **Fix:** Use `UPDATE ... SET points = points - $amount WHERE id = $id AND points >= $amount` and check affected rows.

### H-13: Admin Order Detail Lacks Tenant Authorization
- **File:** `server/routers/admin.ts:93-95`
- `orderDetail` takes only `orderId`, returns complete order details (customer PII, payment info) for ANY order regardless of tenant.
- **Fix:** Load order, verify `order.restaurantId === ctx.restaurantId`, throw FORBIDDEN if mismatched.

### H-14: Multiple Mutations Lack Ownership Validation
- **File:** `server/routers/admin.ts` — multiple locations
- `updateMenuItem`, `deleteMenuItem`, `updateCategory`, `toggleOutletActive`, `updateMemberRole`, `deactivateMember` all operate on entity IDs without verifying tenant ownership.
- **Fix:** For each mutation, load entity, verify `restaurantId` matches caller's tenant.

### H-15: Shadowfax Dispatch Doesn't Verify Tenant Ownership
- **File:** `server/routers/admin.ts:592-756`
- Loads order by ID but never checks `order.restaurantId === ctx.restaurantId`. Can dispatch delivery for another restaurant's order.
- **Fix:** Assert tenant ownership before dispatch.

### H-16: Purchase Order Receipt Doesn't Validate Tenant
- **File:** `server/routers/inventory.ts:273-305`
- `receivePurchaseOrder` accepts `poId` without verifying it belongs to the given `restaurantId`. Can credit stock by receiving another tenant's PO.
- **Fix:** Load PO, verify `po.restaurantId === input.restaurantId`.

### H-17: Platform Fee Rounding Can Produce Negative Transfer
- **File:** `server/integrations/razorpay.ts:134-136`
- No guard against `platformFeePaise > amountPaise` with edge-case percentages. Negative `transferAmountPaise` would be stored in DB even though Razorpay rejects it.
- **Fix:** Clamp: `platformFeePaise = Math.min(calculated, amountPaise)`. Assert `transferAmountPaise >= 0`.

---

## MEDIUM Findings (Backlog)

| # | Finding | File | Category |
|---|---------|------|----------|
| M-01 | No CSRF protection beyond SameSite=Strict | `server/_core/cookies.ts:18-26` | CSRF |
| M-02 | scrypt N=16384 below modern recommendations | `server/security/passwordHash.ts:8` | Weak Hashing |
| M-03 | Guest user ID collision risk (~900M space) | `server/db.ts:1071-1082` | ID Collision |
| M-04 | OTP verification doesn't atomically prevent reuse | `server/db.ts:1177-1193` | Race Condition |
| M-05 | `secure: true` cookie breaks HTTP dev environments | `server/_core/cookies.ts:20,36` | Config |
| M-06 | Context silently swallows auth errors (no logging) | `server/_core/context.ts:40-44` | Observability |
| M-07 | Dashboard loads ALL orders into memory (DoS) | `server/db.ts:1249-1301` | DoS |
| M-08 | Sales report loads all orders into memory | `server/db.ts:1387-1420` | DoS |
| M-09 | Unbounded KDS query (no LIMIT) | `server/routers/kds.ts:27-29` | DoS |
| M-10 | Audit logs query can return cross-tenant data | `server/routers/admin.ts:787-809` | Data Leak |
| M-11 | Global settings accessible without tenant scope | `server/routers/admin.ts:814-822` | Config Tampering |
| M-12 | Notification sends use global credentials, not per-tenant | `server/db.ts:899-950` | Tenant Isolation |
| M-13 | Webhook dedup uses entity ID, not event type+ID composite | `server/integrations/razorpay.ts:329-331` | Idempotency |
| M-14 | Partial refund marks payment fully REFUNDED | `server/integrations/razorpay.ts:489-523` | Financial State |
| M-15 | Tax calculated on pre-discount amount (GST compliance) | `server/domain/orderPricing.ts:99-107` | Tax Accuracy |
| M-16 | Coupon usage check not atomic with order creation | `server/db.ts:679-718` | Coupon Abuse |
| M-17 | Invoice hardcodes 5% GST split regardless of restaurant setting | `server/routers/admin.ts:1078-1079` | Tax Accuracy |
| M-18 | No rate limit on verifyPayment endpoint | `server/routers/storefront.ts:319-334` | Brute Force |
| M-19 | Route linked account set to "active" without verification | `server/integrations/razorpay.ts:100-106` | Incorrect State |
| M-20 | Non-atomic manual order creation (no transaction) | `server/routers/admin.ts:1178-1209` | Data Integrity |
| M-21 | Rider phone stored in audit log (PII in logs) | `server/routers/admin.ts:583-586` | PII Exposure |
| M-22 | confirmPayment TOCTOU between status check and transaction | `server/integrations/razorpay.ts:245-298` | Race Condition |
| M-23 | localAdminEnabled endpoint leaks server configuration | `server/routers.ts:30-32` | Info Disclosure |

---

## LOW Findings

| # | Finding | File | Category |
|---|---------|------|----------|
| L-01 | Slug uniqueness not checked before user creation (orphaned admin) | `server/routers.ts:99-106` | UX / Data Integrity |
| L-02 | Client-side slug generation can produce empty string | `client/src/pages/Signup.tsx:47-48` | Input Validation |
| L-03 | Owner assignment relies on non-atomic getUserByOpenId after insert | `server/routers.ts:108-117` | Race Condition |
| L-04 | Admin panel frontend gating is client-side only | `client/src/pages/Admin.tsx:91` | Defense in Depth |
| L-05 | OTP HMAC secret has development fallback | `server/security/otpHash.ts:18-29` | Crypto Weakness |
| L-06 | Error messages leak Razorpay API response details | `server/integrations/razorpay.ts:92,559` | Info Disclosure |
| L-07 | trackingToken column varchar(36) has minimal headroom | `drizzle/schema.ts:414` | Schema Design |
| L-08 | Missing unique index on refunds.providerRefundId | `drizzle/schema.ts:503-515` | Idempotency |
| L-09 | Webhook exposed as public tRPC mutation (not dedicated route) | `server/routers/storefront.ts:339-345` | Attack Surface |
| L-10 | Image upload extension not whitelisted | `server/routers/admin.ts:248-270` | Path Traversal |
| L-11 | Delivery provider singleton shares state across tenants | `server/integrations/shadowfax.ts:382-397` | Tenant Isolation |
| L-12 | customerProfiles table lacks restaurantId column | `drizzle/schema.ts:131-145` | Schema Design |

---

## Priority Remediation Roadmap

### Immediate (Before Next Deploy)
1. **C-01, C-10:** Make webhook signature verification mandatory for both Razorpay and Shadowfax
2. **C-04:** Remove hardcoded JWT/cookie secret fallbacks; fail at startup
3. **C-03:** Add refund amount validation against original payment
4. **C-06:** Add rate limiting to login/register endpoints

### This Sprint
5. **C-05:** Add unique constraint on `users.email`; make registration atomic
6. **C-07, C-08, C-09:** Fix all cross-tenant data leaks (KDS, customers, customer detail)
7. **H-01, H-02:** Fix tenantProcedure membership check; fix requirePermission fail-open
8. **H-04:** Stop assigning global `role: "admin"` to registrants
9. **H-09:** HTML-escape invoice generator output
10. **H-13, H-14, H-15:** Add tenant ownership checks to all admin mutations

### Next Sprint
11. **H-03, H-05:** Reduce JWT lifetime; implement session revocation
12. **H-06:** Align confirmPayment with order state machine
13. **H-07:** Wire idempotency key through checkout
14. **H-11, H-12:** Add stock constraints; fix loyalty double-spend
15. **M-07, M-08, M-09:** Replace in-memory aggregation with SQL queries

### Backlog
16. Remaining medium and low findings
17. Per-tenant notification credentials (M-12)
18. Settings tenant scoping (M-11)
19. Schema improvements (L-07, L-08, L-12)
