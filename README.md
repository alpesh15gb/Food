# Spice Garden — Cloud Kitchen Platform

A production-ready, multi-brand cloud-kitchen ordering platform built for Indian food businesses. Features a customer-facing storefront, comprehensive admin panel, scheduling engine, payment integration, delivery provider integration, and full order lifecycle management.

## Architecture

```
├── client/src/          # React + Vite SPA (storefront + admin)
│   ├── components/      # UI components (shadcn/ui + custom)
│   ├── pages/           # Route pages (Home, Admin)
│   ├── lib/             # API clients, adapters, utilities
│   ├── hooks/           # Custom React hooks
│   └── contexts/        # React context providers
├── server/              # Express + tRPC backend
│   ├── _core/           # Server setup, auth, context
│   ├── domain/          # Business logic (scheduling, pricing, availability)
│   ├── routers/         # tRPC routers (admin, storefront)
│   ├── integrations/    # Razorpay, Shadowfax adapters
│   ├── auth/            # Authentication helpers
│   └── security/        # Encrypted secret vault
├── shared/              # Shared types and constants
└── drizzle/             # Database schema and migrations
```

**Tech Stack:**
- Frontend: React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui
- Backend: Express + tRPC + TypeScript
- Database: MySQL via Drizzle ORM
- Auth: JWT-based sessions with cookie management
- Payments: Razorpay (TEST + LIVE configuration)
- Delivery: Shadowfax adapter (pluggable provider interface)
- Testing: Vitest with 78 tests across 7 test files

## Features

### Customer Storefront
- Responsive mobile-first design
- Restaurant information with banner, cuisine, and ETA
- Category-based menu browsing with emoji icons
- Search across item names, descriptions, cuisines, and tags
- Filtering by veg/non-veg/bestseller
- Collections (Bestsellers, Recommended, Veg Only)
- Item customization with size and extras
- Cart with quantity management
- Razorpay checkout with signature verification
- Order tracking

### Admin Panel
- Dashboard with key metrics (orders, sales, AOV, pipeline)
- Order management with status filtering and actions
- Menu management with item CRUD and availability toggles
- Category management
- Coupon creation with flat/percentage discounts
- Restaurant settings (fees, minimums, schedules, closure)
- Integration settings for Razorpay and Shadowfax
- CSV menu import/export
- RBAC with Super Admin, Ops Manager, Kitchen Manager roles
- Audit logging for all admin actions

### Backend
- **Scheduling Engine**: Cross-midnight schedules, weekday rules, date ranges, temporary closures
- **Availability Hierarchy**: Restaurant → Outlet → Category → Item + Schedule + Stock
- **Order State Machine**: 15 order states with validated transitions
- **Pricing Engine**: Server-side calculation with tax, packaging, delivery, and coupon validation
- **Payment Integration**: Razorpay with webhooks, signature verification, refunds
- **Delivery Integration**: Shadowfax adapter with mock/test mode
- **Webhook Idempotency**: Prevents duplicate event processing
- **Encrypted Vault**: AES-256-GCM encryption for integration secrets

## Database Schema

Supports 30+ tables including:
- `restaurants`, `restaurantSchedules` — Multi-brand/multi-outlet
- `menuCategories`, `categorySchedules`, `menuItems`, `productSchedules` — Full scheduling
- `productVariants`, `addonGroups`, `addonOptions` — Customizations
- `orders`, `orderItems`, `orderStatusHistory` — Complete order lifecycle
- `payments`, `refunds` — Payment tracking
- `deliveries`, `deliveryStatusHistory` — Shadowfax integration
- `coupons`, `couponUsage` — Offer management
- `customerProfiles`, `customerAddresses` — Customer management
- `adminRoles`, `adminRolePermissions` — RBAC
- `auditLogs` — Admin action logging
- `webhookEvents` — Idempotent webhook processing
- `settings`, `importJobs` — Configuration and bulk operations

## Setup

### Prerequisites
- Node.js 18+
- MySQL 8+
- pnpm

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env
# Edit .env with your database credentials

# Push database schema
pnpm db:push

# Start development server
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | MySQL connection string |
| `JWT_SECRET` | Yes | Session signing key (64+ chars) |
| `COOKIE_SECRET` | Yes | Cookie encryption key |
| `SECRET_ENCRYPTION_KEY` | Yes | 32-byte hex for AES-256-GCM vault |
| `LOCAL_ADMIN_TOKEN` | Dev | Admin login passphrase |
| `RAZORPAY_KEY_ID` | For payments | Razorpay publishable key |
| `RAZORPAY_KEY_SECRET` | For payments | Razorpay secret key |
| `RAZORPAY_WEBHOOK_SECRET` | For payments | Razorpay webhook HMAC secret |
| `SHADOWFAX_API_KEY` | For delivery | Shadowfax API key |
| `SHADOWFAX_MERCHANT_ID` | For delivery | Shadowfax merchant ID |

### Development

```bash
# Run dev server (API + frontend with HMR)
pnpm dev

# Run tests
pnpm test

# Type check
pnpm check

# Format code
pnpm format

# Build for production
pnpm build

# Start production server
pnpm start
```

### Admin Access

Navigate to `/admin` and use the `LOCAL_ADMIN_TOKEN` value from your `.env` file to sign in as administrator.

## Testing

```bash
# Run all tests
pnpm test

# Tests cover:
# - Order pricing calculations and validation
# - Scheduling engine (cross-midnight, weekdays, date ranges)
# - Order state machine transitions
# - Availability hierarchy
# - Coupon validation
# - Webhook idempotency
# - Menu CSV import
# - Auth logout
```

## Production Deployment

1. Set all environment variables in production
2. Configure Razorpay LIVE keys via admin panel → Integrations
3. Configure Shadowfax credentials via admin panel → Integrations
4. Run `pnpm build && pnpm start`
5. Set up reverse proxy (nginx/caddy) for HTTPS
6. Configure Razorpay webhook URL: `https://your-domain.com/api/trpc/storefront.razorpayWebhook`
7. Configure Shadowfax webhook URL: `https://your-domain.com/api/trpc/storefront.shadowfaxWebhook`

## License

MIT
