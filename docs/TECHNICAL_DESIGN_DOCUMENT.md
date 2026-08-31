# Technical Design Document (TDD) — 9House Kitchen

**Version:** 1.0  
**Date:** August 31, 2026  
**Domain:** 9housekitchen.in  
**Repository:** https://github.com/alpesh15gb/Food

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Database Architecture](#6-database-architecture)
7. [Authentication & Security](#7-authentication--security)
8. [Payment Integration Architecture](#8-payment-integration-architecture)
9. [Delivery Integration Architecture](#9-delivery-integration-architecture)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Performance Strategy](#11-performance-strategy)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        INTERNET                                   │
│                     9housekitchen.in                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS (443)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NGINX REVERSE PROXY                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  • SSL termination (Let's Encrypt)                        │   │
│  │  • Rate limiting (30 req/s general, 5 req/s auth)        │   │
│  │  • Security headers (HSTS, CSP, X-Frame-Options)         │   │
│  │  • Static file serving (/assets)                          │   │
│  │  • Proxy pass to Node.js (127.0.0.1:4300)                │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (4300)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NODE.JS APPLICATION                             │
│                   Express + tRPC + React SPA                      │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     EXPRESS SERVER                        │   │
│  │  • HTTP request handling                                  │   │
│  │  • Cookie parsing and session management                  │   │
│  │  • CORS configuration                                     │   │
│  │  • Request logging                                        │   │
│  └──────────────────────────────┬───────────────────────────┘   │
│                                  │                                │
│  ┌──────────────────────────────┴───────────────────────────┐   │
│  │                     TRPC ROUTER                           │   │
│  │  ┌─────────┐  ┌─────────────┐  ┌───────────────────┐    │   │
│  │  │  auth    │  │ storefront  │  │      admin         │    │   │
│  │  │  router  │  │   router    │  │      router        │    │   │
│  │  └─────────┘  └─────────────┘  └───────────────────┘    │   │
│  └──────────────────────────────┬───────────────────────────┘   │
│                                  │                                │
│  ┌──────────────────────────────┴───────────────────────────┐   │
│  │                   BUSINESS LOGIC LAYER                    │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │Scheduling│ │Availab-  │ │Order     │ │Order     │   │   │
│  │  │Engine    │ │ility     │ │Pricing   │ │State     │   │   │
│  │  │          │ │Service   │ │Engine    │ │Machine   │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  └──────────────────────────────┬───────────────────────────┘   │
│                                  │                                │
│  ┌──────────────────────────────┴───────────────────────────┐   │
│  │                  INTEGRATION LAYER                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │ Razorpay      │  │ Shadowfax    │  │ Secret Vault │   │   │
│  │  │ Adapter       │  │ Adapter      │  │ (AES-256)    │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  └──────────────────────────────┬───────────────────────────┘   │
│                                  │                                │
│  ┌──────────────────────────────┴───────────────────────────┐   │
│  │                    DATA ACCESS LAYER                      │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │  Drizzle ORM — type-safe SQL queries              │    │   │
│  │  │  • Parameterized queries (SQL injection safe)     │    │   │
│  │  │  • Schema-first approach                          │    │   │
│  │  │  • Migration management                           │    │   │
│  │  └──────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               STATIC FILE SERVING                         │   │
│  │  • Built React SPA served from /dist/client               │   │
│  │  • API requests routed to tRPC                            │   │
│  │  • All other routes serve index.html (SPA fallback)       │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ TCP (5432, internal only)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   POSTGRESQL 16                                   │
│                   Docker Container                                │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  • 34 tables, 15 native enums                            │   │
│  │  • Persistent Docker volume (cloudkitchen_pgdata)         │   │
│  │  • Health checks: pg_isready every 10s                    │   │
│  │  • Connection pooling via pg driver                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

External Service Connections:
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Razorpay   │  │  Shadowfax   │  │     S3       │
│  REST API    │  │  REST API    │  │  (planned)   │
│  + Webhooks  │  │  + Webhooks  │  │  Image store │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Request Flow

```
Customer Request:
1. Browser sends HTTPS request to 9housekitchen.in
2. Nginx terminates SSL, applies rate limiting
3. Static assets served directly by Nginx
4. API requests proxied to Node.js (127.0.0.1:4300)
5. Express parses request, extracts session cookie
6. tRPC router matches procedure (public/admin/storefront)
7. Auth middleware validates session (for protected routes)
8. Zod validates input schema
9. Business logic layer processes request
10. Drizzle ORM queries PostgreSQL
11. Response serialized as JSON
12. Response returned through tRPC → Express → Nginx → Browser
```

---

## 2. Technology Stack

### Core Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Language** | TypeScript | 5.x | Type safety across entire stack |
| **Runtime** | Node.js | 18+ | Server-side JavaScript execution |
| **Package Manager** | pnpm | 9.x | Fast, disk-efficient package management |

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 19.x | UI component library |
| **Vite** | 6.x | Build tool, dev server, HMR |
| **Tailwind CSS** | 4.x | Utility-first CSS framework |
| **shadcn/ui** | Latest | Pre-built accessible UI components |
| **Radix UI** | Latest | Headless UI primitives (via shadcn) |
| **class-variance-authority** | Latest | Variant-based component styling |
| **wouter** | Latest | Lightweight client-side routing |
| **tRPC Client** | 11.x | Type-safe API calls |
| **React Query** | Latest | Server state management (via tRPC) |
| **Lucide React** | Latest | Icon library |
| **Sonner** | Latest | Toast notifications |
| **Recharts** | (planned) | Data visualization for admin charts |

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Express** | 4.x | HTTP server framework |
| **tRPC** | 11.x | Type-safe API layer |
| **Drizzle ORM** | Latest | Type-safe SQL ORM |
| **pg (node-postgres)** | Latest | PostgreSQL client driver |
| **Zod** | Latest | Input validation schemas |
| **bcrypt** | Latest | Password hashing (for future use) |
| **jsonwebtoken** | Latest | JWT session tokens |
| **Razorpay SDK** | Latest | Payment integration |

### Database

| Technology | Version | Purpose |
|-----------|---------|---------|
| **PostgreSQL** | 16 | Primary relational database |
| **Drizzle Kit** | Latest | Schema migrations and push |

### DevOps

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Docker** | Latest | Containerization |
| **Docker Compose** | Latest | Multi-container orchestration |
| **Nginx** | Latest | Reverse proxy, SSL, rate limiting |
| **Let's Encrypt / Certbot** | Latest | SSL certificate management |
| **Vitest** | Latest | Unit/integration testing |

---

## 3. Monorepo Structure

```
Food/
├── client/                          # Frontend (React + Vite)
│   ├── src/
│   │   ├── _core/                   # Core client utilities
│   │   │   └── hooks/
│   │   │       └── useAuth.ts       # Authentication hook
│   │   ├── components/              # Reusable UI components
│   │   │   ├── ui/                  # shadcn/ui components (18+ files)
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── drawer.tsx
│   │   │   │   ├── sonner.tsx       # Toast wrapper
│   │   │   │   └── ...
│   │   │   ├── DashboardLayout.tsx  # Admin layout wrapper
│   │   │   ├── ErrorBoundary.tsx    # React error boundary
│   │   │   ├── IntegrationPanel.tsx # Razorpay/Shadowfax config
│   │   │   ├── MenuImportPanel.tsx  # CSV import interface
│   │   │   └── OrderingApp.tsx      # Main storefront (1449 lines)
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx      # Theme provider
│   │   ├── hooks/                   # Custom React hooks
│   │   ├── lib/                     # Utilities and API clients
│   │   │   ├── mockApi.ts           # Mock API for development
│   │   │   ├── storefrontAdapter.ts # Data transformation layer
│   │   │   ├── trpc.ts              # tRPC client setup
│   │   │   └── utils.ts             # cn() utility, helpers
│   │   ├── pages/
│   │   │   ├── Admin.tsx            # Admin panel (1000+ lines)
│   │   │   └── Home.tsx             # Storefront entry
│   │   ├── App.tsx                  # Root component + router
│   │   ├── main.tsx                 # Entry point
│   │   ├── index.css                # Global styles + design tokens
│   │   └── vite-env.d.ts           # Vite type declarations
│   ├── index.html                   # HTML entry point
│   └── ...
│
├── server/                          # Backend (Express + tRPC)
│   ├── _core/                       # Server infrastructure
│   │   ├── context.ts               # tRPC context (session, db)
│   │   ├── cookies.ts               # Cookie configuration
│   │   ├── env.ts                   # Environment variable validation
│   │   ├── oauth.ts                 # OAuth helpers
│   │   ├── sdk.ts                   # JWT signing/verification
│   │   ├── storageProxy.ts          # S3 proxy (planned)
│   │   ├── systemRouter.ts          # Health check endpoint
│   │   ├── trpc.ts                  # tRPC initialization + middleware
│   │   ├── vite.ts                  # Static file serving
│   │   └── types/
│   │       └── manusTypes.ts        # Extended type definitions
│   ├── auth/
│   │   └── localAdmin.ts            # Local admin authentication
│   ├── domain/                      # Business logic services
│   │   ├── availability.ts          # Item availability hierarchy
│   │   ├── availability.test.ts     # 14 tests
│   │   ├── orderPricing.ts          # Server-side price calculation
│   │   ├── orderPricing.test.ts     # 17 tests
│   │   ├── orderStateMachine.ts     # Order state transitions
│   │   ├── orderStateMachine.test.ts# 22 tests
│   │   ├── scheduling.ts            # Timezone-aware scheduling
│   │   └── scheduling.test.ts       # 20 tests
│   ├── integrations/                # External service adapters
│   │   ├── razorpay.ts              # Razorpay payment adapter
│   │   ├── shadowfax.ts             # Shadowfax delivery adapter
│   │   └── webhookIdempotency.test.ts # 2 tests
│   ├── routers/                     # tRPC route definitions
│   │   ├── admin.ts                 # Admin API (22 endpoints)
│   │   └── storefront.ts            # Storefront API (8 endpoints)
│   ├── security/
│   │   └── secretVault.ts           # AES-256-GCM encrypted vault
│   ├── db.ts                        # Database connection + query helpers
│   ├── integrations.ts              # Integration status aggregator
│   ├── index.ts                     # Express server entry point
│   ├── menuImport.ts                # CSV import/export logic
│   ├── menuImport.test.ts           # 2 tests
│   ├── routers.ts                   # Root router composition
│   └── storage.ts                   # File storage abstraction
│
├── shared/                          # Shared types and constants
│   ├── _core/
│   │   └── errors.ts                # Shared error classes
│   ├── const.ts                     # App-wide constants
│   └── types.ts                     # Re-exported types
│
├── drizzle/                         # Database schema and migrations
│   ├── schema.ts                    # Complete schema (34 tables)
│   └── 0000_soft_colonel_america.sql # PostgreSQL migration
│
├── deploy/                          # Deployment configuration
│   ├── docker-compose.yml           # Docker services
│   ├── docker-compose.prod.yml      # Production overrides
│   ├── Dockerfile                   # App container build
│   ├── nginx.conf                   # Nginx configuration
│   ├── config.env.example           # Environment template
│   ├── deploy.sh                    # One-command deploy script
│   ├── setup.sh                     # Development setup script
│   └── seed.sql                     # Database seed data
│
├── docs/                            # Documentation
│   ├── PRD.md                       # Product Requirements Document
│   ├── APP_FLOW.md                  # User journey maps
│   ├── API_DOCUMENTATION.md         # Complete API reference
│   ├── UI_UX_DESIGN_BRIEF.md        # Design system
│   ├── TECHNICAL_DESIGN_DOCUMENT.md # This document
│   ├── BACKEND_SCHEMA.md            # Database schema reference
│   └── IMPLEMENTATION_PLAN.md       # Development timeline
│
├── package.json                     # Dependencies + scripts
├── tsconfig.json                    # TypeScript config (client)
├── tsconfig.node.json               # TypeScript config (server)
├── vite.config.ts                   # Vite build config
├── vitest.config.ts                 # Test runner config
├── drizzle.config.ts                # Drizzle ORM config
├── components.json                  # shadcn/ui config
├── docker-compose.yml               # Root Docker Compose
└── .env.example                     # Environment template
```

### File Counts

| Directory | Files | Purpose |
|-----------|-------|---------|
| `client/src/` | ~40 files | Frontend application |
| `server/` | ~30 files | Backend API and business logic |
| `shared/` | 3 files | Shared types and constants |
| `drizzle/` | 2 files | Schema and migrations |
| `deploy/` | 7 files | Deployment infrastructure |
| `docs/` | 7 files | Documentation |
| **Total** | **~121 source files** | |

---

## 4. Frontend Architecture

### Routing

```typescript
// client/src/App.tsx — using wouter (lightweight router)
<Switch>
  <Route path="/admin" component={Admin} />
  <Route path="/admin/:section" component={Admin} />
  <Route path="/" component={Home} />
  <Route path="/burger-district/:rest*" component={Home} />
  <Route component={Home} />  {/* Fallback */}
</Switch>
```

**Route resolution (client-side):**

The `OrderingApp` component determines the screen based on `window.location.pathname`:
```typescript
const screen = path.includes("/cart") ? "cart"
  : path.includes("/checkout") ? "checkout"
  : path.includes("/confirmation") ? "confirmation"
  : path.includes("/order/") ? "tracking"
  : "menu";
```

### API Layer

```typescript
// client/src/lib/trpc.ts — tRPC client setup
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../server/routers";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      credentials: "include",  // Send session cookie
    }),
  ],
});
```

**Data fetching (React Query via tRPC):**
```typescript
// All queries use React Query under the hood
const storefront = trpc.storefront.get.useQuery({ slug: "spice-garden" });
const dashboard = trpc.admin.dashboard.useQuery({ slug: "spice-garden" });

// Mutations with cache invalidation
const updateOrder = trpc.admin.updateOrderStatus.useMutation({
  onSuccess: () => utils.admin.dashboard.invalidate(),
});
```

### Component Architecture

```
App
├── ErrorBoundary (catches React errors)
│   └── ThemeProvider (light/dark theme)
│       └── TooltipProvider (Radix tooltip)
│           └── Toaster (Sonner toast)
│           └── Router (wouter)
│               ├── "/" → Home → OrderingApp
│               │   ├── TopBar (sticky header)
│               │   ├── HeroBanner
│               │   ├── DeliveryAddressBar
│               │   ├── OfferBanner (horizontal scroll)
│               │   ├── SearchBar (with debounce)
│               │   ├── CategoryPills (mobile scroll)
│               │   ├── FilterChips
│               │   ├── Collections (Bestsellers, Recommended)
│               │   ├── MenuStream → MenuCard (×N)
│               │   ├── CartTicket (desktop sidebar)
│               │   ├── MobileCartBar (fixed bottom)
│               │   ├── CustomizationDrawer (bottom sheet)
│               │   │   ├── OptionGroup (size, extras)
│               │   │   └── Quantity control
│               │   └── AddressDialog (modal)
│               │
│               └── "/admin" → Admin
│                   ├── AdminAccess (login form)
│                   └── DashboardLayout (sidebar + content)
│                       ├── Sidebar (collapsible)
│                       ├── OverviewPanel (KPIs + pipeline)
│                       ├── OrdersPanel (table + filters)
│                       ├── MenuPanel (form + list)
│                       ├── CouponsPanel (form + list)
│                       ├── RestaurantPanel (settings form)
│                       ├── IntegrationPanel (Razorpay/Shadowfax)
│                       └── MenuImportWorkspace (CSV upload)
```

### State Management

| State | Location | Management |
|-------|----------|-----------|
| Server data | tRPC cache | React Query (automatic caching, refetching) |
| Cart | Component state | `useState` in OrderingApp (not persisted) |
| UI state | Component state | `useState` (modals, drawers, search query) |
| Auth session | Cookie | HttpOnly cookie, read via `auth.me` |
| Theme | Context | ThemeProvider with localStorage persistence |

### Build Configuration

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react(), tailwindcss(), path.resolve(__dirname, "server/_core/vite.ts")],
  build: {
    outDir: "dist/client",
  },
});
```

---

## 5. Backend Architecture

### Express Server Setup

```typescript
// server/index.ts
const app = express();
app.use(express.json());
app.use(cookieParser());

// tRPC handler
app.use("/api/trpc", createExpressMiddleware({
  router: appRouter,
  createContext: createContext,  // Extracts session from cookie
  onError: ({ error }) => { /* logging */ },
}));

// Static file serving (production)
app.use("/assets", express.static("dist/client/assets"));
app.get("*", serveStatic);  // SPA fallback
```

### tRPC Middleware Chain

```
Request
  │
  ▼
┌─────────────────────┐
│ createContext()      │  Extract session cookie, user from JWT
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Input Validation     │  Zod schema validates all input
└──────────┬──────────┘
           │
           ├── publicProcedure ──► No auth required
           │
           ├── protectedProcedure ──► Requires valid session
           │   └── Check: ctx.user exists
           │
           └── adminProcedure ──► Requires admin role
               └── Check: ctx.user.role === "admin"
           │
           ▼
┌─────────────────────┐
│ Route Handler        │  Business logic executes
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Response             │  JSON serialized to client
└─────────────────────┘
```

### Business Logic Services

| Service | File | Responsibility |
|---------|------|---------------|
| **Scheduling Engine** | `server/domain/scheduling.ts` | Timezone-aware schedule evaluation, cross-midnight support, weekday/date-range rules |
| **Availability Service** | `server/domain/availability.ts` | Hierarchical availability check: Restaurant → Outlet → Category → Item + Schedule + Stock |
| **Order Pricing Engine** | `server/domain/orderPricing.ts` | Server-side price calculation: item totals, taxes, packaging, delivery, coupon validation, minimum order |
| **Order State Machine** | `server/domain/orderStateMachine.ts` | 15-state lifecycle with validated transitions, payment status mapping, audit logging |

### Design Patterns

| Pattern | Usage |
|---------|-------|
| **Repository Pattern** | `server/db.ts` contains all database query functions |
| **Adapter Pattern** | Razorpay and Shadowfax are pluggable adapters behind interfaces |
| **Strategy Pattern** | Delivery provider selected at runtime (mock vs production) |
| **Observer Pattern** | Webhook handlers process external events asynchronously |
| **Middleware Pattern** | tRPC middleware chain for auth, validation, logging |
| **Vault Pattern** | AES-256-GCM encrypted credential storage |

---

## 6. Database Architecture

### Database Choice

| Property | Value |
|----------|-------|
| **Engine** | PostgreSQL 16 |
| **ORM** | Drizzle ORM (schema-first) |
| **Driver** | `pg` (node-postgres) |
| **Connection** | `DATABASE_URL` environment variable |
| **Docker** | `postgres:16-alpine` image |
| **Storage** | Persistent Docker volume |

### Schema Approach

Drizzle uses a **schema-first** approach — the TypeScript schema file IS the source of truth:

```typescript
// drizzle/schema.ts
export const menuItems = pgTable("menu_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 })
    .notNull().references(() => restaurants.id),
  name: varchar("name", { length: 180 }).notNull(),
  pricePaise: integer("price_paise").notNull(),
  // ... 25+ columns
});
```

### Migration Strategy

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Push schema directly (development)
npx drizzle-kit push

# Pull schema from database
npx drizzle-kit pull
```

### Key Schema Decisions

| Decision | Rationale |
|----------|-----------|
| `varchar(36)` for IDs | UUID-like strings, no auto-increment exposure |
| `integer` for money (paise) | Avoids floating-point errors; ₹199.00 = 19900 |
| `jsonb` for modifier snapshots | Orders store immutable snapshots of selected modifiers |
| `jsonb` for address snapshots | Order address doesn't change when customer updates address |
| `pgEnum` for statuses | Type-safe constrained values, prevents invalid states |
| Separate schedule tables | Flexible scheduling without schema changes |
| `text` for `cipherText` | Variable-length encrypted data |
| `timestamp` for all dates | Timezone-aware (stored as UTC, displayed as IST) |

### Table Categories

| Category | Tables | Purpose |
|----------|--------|---------|
| Auth & RBAC | 4 | Users, roles, permissions, user-role assignments |
| Customers | 2 | Profiles, addresses |
| Restaurant | 4 | Restaurants, outlets, restaurant schedules, outlet schedules |
| Menu | 7 | Categories, items, images, product schedules, variants, addon groups, addon options |
| Cart | 2 | Carts, cart items |
| Orders | 3 | Orders, order items, order status history |
| Payments | 2 | Payments, refunds |
| Delivery | 2 | Deliveries, delivery status history |
| Promotions | 2 | Coupons, coupon usage |
| System | 4 | Settings, audit logs, webhook events, import jobs |
| **Total** | **34** | |

See [BACKEND_SCHEMA.md](./BACKEND_SCHEMA.md) for complete table definitions.

---

## 7. Authentication & Security

### Authentication Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. User visits /admin                                  │
│  2. Frontend calls: auth.me → null (not authenticated)   │
│  3. Frontend shows: AdminAccess (login form)             │
│  4. User enters passphrase                              │
│  5. Frontend calls: auth.localAdminLogin({ token })      │
│  6. Server validates with timing-safe comparison          │
│  7. Server creates/updates user record (role: "admin")   │
│  8. Server signs JWT (12-hour expiry)                    │
│  9. Server sets HttpOnly cookie: app_session_id          │
│  10. Frontend reloads page                              │
│  11. Subsequent requests include session cookie          │
│  12. tRPC middleware validates session on admin routes    │
└─────────────────────────────────────────────────────────┘
```

### JWT Session

```typescript
// Token payload
{
  openId: "vps-local-administrator",
  appId: "vps-local",
  name: "Kitchen Administrator",
  iat: 1693478400,
  exp: 1693521600  // 12 hours
}

// Cookie settings
{
  httpOnly: true,
  secure: true,         // HTTPS only
  sameSite: "strict",   // CSRF protection
  maxAge: 43200000,     // 12 hours
  path: "/"
}
```

### Customer OTP Authentication

```
┌─────────────────────────────────────────────────────────┐
│  CUSTOMER PHONE LOGIN (OTP)                              │
│                                                          │
│  Storefront header → Login button → Enter phone          │
│       │                                                  │
│       ▼                                                  │
│  storefront.sendOtp(phone)                              │
│       ├── Validate: 10-digit Indian mobile               │
│       ├── Rate limit: 3 sends/10min/phone                │
│       ├── Rate limit: 20 OTP req/10min/IP               │
│       ├── Cooldown: 60s between resend                   │
│       ├── Generate: crypto.randomInt (6 digits)          │
│       ├── Hash: HMAC-SHA256(secret, phone:purpose:code) │
│       ├── Store hash in otp_verifications               │
│       └── Log code (OTP_DEV_LOG_ENABLED only)           │
│                                                          │
│  Enter code → storefront.verifyOtp(phone, code)         │
│       ├── Rate limit: 10 verifies/10min/phone            │
│       ├── Rate limit: 20 OTP req/10min/IP               │
│       ├── Find active OTP (HMAC comparison)              │
│       ├── Check: not used, not expired, attempts < 5     │
│       ├── Atomic SQL: mark used + increment attempts     │
│       ├── Create/update verified customer profile        │
│       ├── Set SameSite=Strict cookie (30 days)           │
│       └── Return success                                │
│                                                          │
│  customerMe: reads identity from session cookie only     │
│  customerLogout: clears session cookie                   │
└─────────────────────────────────────────────────────────┘
```

### Guest Checkout Identity Model

```
┌─────────────────────────────────────────────────────────┐
│  GUEST IDENTITY                                          │
│                                                          │
│  - Guest openId: guest_<nanoid> (random, 24 chars)      │
│  - NOT derived from phone number                         │
│  - Two guests with same phone = two independent accounts │
│  - Guest phone stored on order as contact info only      │
│                                                          │
│  GUEST → VERIFIED: NO automatic merge                    │
│  - Verifying phone creates customer_<phone> identity     │
│  - Guest orders stay under guest_<nanoid>                │
│  - Past orders claimable via order tracking token        │
│  - Prevents attacker-checkout injection attacks          │
│                                                          │
│  WHY: A verified phone proves ownership of the phone     │
│  NOW. It does NOT prove the customer created every       │
│  past order where someone typed that phone number.       │
└─────────────────────────────────────────────────────────┘
```

### Session Configuration

| Session | Cookie | SameSite | Max Age | Purpose |
|---------|--------|----------|---------|----------|
| Admin | `app_session_id` | Strict | 12 hours | Admin panel |
| Customer | `app_session_id` | Strict | 30 days | Storefront |

Both use the same cookie name. Admin sessions require `role: "admin"` in the JWT. Customer sessions have `role: "user"`. The server-side middleware enforces this separation — a customer session cannot call admin procedures.

### Security Layers

| Layer | Implementation |
|-------|---------------|
| **Transport** | HTTPS via Let's Encrypt SSL (nginx) |
| **Cookie** | HttpOnly, Secure, SameSite=Strict |
| **Auth** | JWT with timing-safe comparison |
| **OTP Hashing** | HMAC-SHA256 with env-only secret |
| **Rate Limiting** | Per-phone + per-IP in-memory + Nginx |
| **Guest Identity** | Cryptographically random, not phone-derived |
| **RBAC** | Role-based access control (admin only currently) |
| **Input** | Zod validation on all tRPC inputs |
| **SQL** | Drizzle ORM parameterized queries |
| **Secrets** | AES-256-GCM encrypted vault for integration keys |
| **Webhooks** | HMAC signature verification |
| **Rate Limiting** | Nginx-level rate limiting |
| **Headers** | Security headers via nginx (HSTS, CSP, X-Frame-Options) |
| **Audit** | All admin actions logged with actor, target, before/after data |

### Secret Management

```
Environment Variables (root secrets):
├── JWT_SECRET → Signs JWT tokens
├── COOKIE_SECRET → Cookie encryption
├── SECRET_ENCRYPTION_KEY → AES-256-GCM vault key
├── DATABASE_URL → PostgreSQL connection
└── LOCAL_ADMIN_TOKEN → Admin passphrase

Encrypted Vault (integration_secrets table):
├── razorpay/key_id → Razorpay publishable key
├── razorpay/key_secret → Razorpay secret (encrypted)
├── razorpay/webhook_secret → Razorpay webhook HMAC (encrypted)
├── delivery/api_key → Shadowfax API key (encrypted)
├── delivery/merchant_id → Shadowfax merchant ID (encrypted)
└── delivery/webhook_secret → Shadowfax webhook HMAC (encrypted)
```

---

## 8. Payment Integration Architecture

### Razorpay Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │     │   Backend    │     │   Razorpay   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                     │                     │
       │  1. Checkout        │                     │
       │────────────────────►│                     │
       │                     │  2. Create Order    │
       │                     │────────────────────►│
       │                     │  3. Order ID        │
       │                     │◄────────────────────│
       │  4. {keyId,orderId} │                     │
       │◄────────────────────│                     │
       │                     │                     │
       │  5. Open Checkout   │                     │
       │─────────────────────────────────────────►│
       │                     │                     │
       │  6. Payment Done    │                     │
       │◄─────────────────────────────────────────│
       │                     │                     │
       │  7. Verify          │                     │
       │────────────────────►│                     │
       │                     │  8. Verify HMAC     │
       │                     │────────────────────►│
       │                     │  9. Valid            │
       │                     │◄────────────────────│
       │  10. Success        │                     │
       │◄────────────────────│                     │
```

### Webhook Flow

```
Razorpay → POST /api/trpc/storefront.razorpayWebhook
  │
  ├── 1. Parse raw body
  ├── 2. Extract X-Razorpay-Signature header
  ├── 3. Verify HMAC-SHA256 (body + webhook_secret)
  ├── 4. Check webhook_events table (idempotency)
  │     ├── Duplicate → Return 200, skip processing
  │     └── New event → Continue
  ├── 5. Process event:
  │     ├── payment.captured → Update order + payment
  │     ├── payment.failed → Update order + payment
  │     ├── refund.created → Update refund status
  │     ├── refund.processed → Update refund + order
  │     └── refund.failed → Update refund, alert admin
  ├── 6. Insert into webhook_events (marked processed)
  └── 7. Return 200 OK
```

---

## 9. Delivery Integration Architecture

### Provider Interface

```typescript
interface DeliveryProvider {
  checkServiceability(pincode: string): Promise<ServiceabilityResult>;
  getDeliveryQuote(params: QuoteParams): Promise<DeliveryQuote>;
  createDelivery(params: DeliveryParams): Promise<DeliveryResult>;
  getDelivery(deliveryId: string): Promise<DeliveryStatus>;
  cancelDelivery(deliveryId: string): Promise<CancelResult>;
  handleWebhook(payload: Record<string, unknown>, signature?: string): Promise<WebhookResult>;
}
```

### Mock vs Production

```
┌─────────────────────────────────────────────────────┐
│  if (SHADOWFAX_API_KEY is configured)                │
│    → ShadowfaxProductionAdapter                     │
│      • Real HTTP calls to api.shadowfax.in           │
│      • Real webhook signature verification           │
│  else                                                │
│    → ShadowfaxMockAdapter                            │
│      • Simulated responses with delays               │
│      • Auto-assigns rider after 5s                   │
│      • Auto-delivers after 30s                       │
│      • Full API surface available for development    │
└─────────────────────────────────────────────────────┘
```

### Status Mapping

```
Shadowfax Status    →  Internal Order Status
─────────────────────────────────────────────
(pending)           →  DELIVERY_REQUESTED
rider_assigned      →  RIDER_ASSIGNED
picked_up           →  PICKED_UP
out_for_delivery    →  OUT_FOR_DELIVERY
delivered           →  DELIVERED
cancelled/failed    →  (manual review needed)
```

---

## 10. Deployment Architecture

### Docker Compose Services

```yaml
services:
  app:          # Node.js application
    build: deploy/Dockerfile
    ports: "127.0.0.1:4300:4300"
    depends_on: db (healthy)
    restart: unless-stopped

  db:           # PostgreSQL 16
    image: postgres:16-alpine
    volumes: cloudkitchen_pgdata:/var/lib/postgresql/data
    healthcheck: pg_isready
    restart: unless-stopped

volumes:
  cloudkitchen_pgdata:   # Persistent database storage
```

### Nginx Configuration

```
Server blocks:
├── HTTP (80) → Redirect to HTTPS
└── HTTPS (443)
    ├── SSL: Let's Encrypt certificate
    ├── Security headers: HSTS, CSP, X-Frame-Options
    ├── Rate limiting: 30 req/s general, 5 req/s auth
    ├── Static files: /assets → /opt/cloudkitchen/dist/client/assets
    ├── API proxy: /api → 127.0.0.1:4300
    └── SPA fallback: /* → 127.0.0.1:4300 (serves index.html)
```

### Build Pipeline

```bash
# Production build
pnpm install                    # Install dependencies
npx drizzle-kit push            # Push schema to PostgreSQL
pnpm build                      # Vite build → dist/client/
pnpm start                      # Express serves API + static files
```

### Process Management

| Component | Management |
|-----------|-----------|
| Node.js app | Docker Compose `restart: unless-stopped` |
| PostgreSQL | Docker Compose `restart: unless-stopped` |
| Nginx | `systemctl` (host-level) |
| SSL renewal | Certbot cron job (auto-renewal) |

---

## 11. Performance Strategy

### Frontend Performance

| Strategy | Implementation |
|----------|---------------|
| **Code splitting** | Vite automatic chunking |
| **Tree shaking** | ES modules + Vite |
| **Lazy loading** | Route-based lazy loading (planned) |
| **Optimized images** | Responsive `srcset` (planned) |
| **Debounced search** | 300ms debounce on search input |
| **Skeleton screens** | Loading states for all async data |
| **CSS optimization** | Tailwind CSS purging unused classes |
| **Font loading** | Google Fonts (Manrope, DM Serif Display) |

### Backend Performance

| Strategy | Implementation |
|----------|---------------|
| **Database indexes** | Indexes on all query-heavy columns |
| **Parameterized queries** | Drizzle ORM SQL injection prevention |
| **Connection pooling** | pg driver built-in pooling |
| **Minimal data transfer** | Only required fields selected |
| **Batch requests** | tRPC HTTP batching support |
| **Static file caching** | Nginx `Cache-Control` headers |

### Database Indexes

```sql
-- High-traffic query indexes
CREATE INDEX idx_menu_item_restaurant ON menu_items(restaurant_id);
CREATE INDEX idx_menu_item_category ON menu_items(category_id);
CREATE INDEX idx_order_restaurant_status ON orders(restaurant_id, status);
CREATE INDEX idx_order_customer ON orders(customer_id);
CREATE INDEX idx_order_created ON orders(created_at);
CREATE INDEX idx_payment_order ON payments(order_id);
CREATE INDEX idx_delivery_order ON deliveries(order_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE UNIQUE INDEX idx_coupon_code_per_restaurant ON coupons(restaurant_id, code);
CREATE UNIQUE INDEX idx_webhook_event_idx ON webhook_events(provider, external_id);
```

---

## 12. Testing Strategy

### Test Framework

| Tool | Purpose |
|------|---------|
| **Vitest** | Unit and integration testing |
| **Node.js test runner** | Server-side tests |

### Test Coverage

| File | Tests | Coverage |
|------|-------|----------|
| `orderPricing.test.ts` | 17 | Pricing calculations, coupon validation, stock checks, tax, minimum order |
| `scheduling.test.ts` | 20 | Cross-midnight, weekday rules, date ranges, temporary closures |
| `orderStateMachine.test.ts` | 22 | All 15 states, valid/invalid transitions, payment mapping |
| `availability.test.ts` | 14 | Full hierarchy, schedule checks, stock checks |
| `webhookIdempotency.test.ts` | 2 | Duplicate event detection |
| `menuImport.test.ts` | 2 | CSV parsing, validation |
| `auth.logout.test.ts` | 1 | Session clearing |
| **Total** | **78** | **All passing** |

### Test Categories

| Category | Priority | Current State |
|----------|----------|--------------|
| Unit tests (business logic) | P0 | ✅ 78 tests |
| Integration tests (API endpoints) | P1 | ⬜ Planned |
| E2E tests (user flows) | P2 | ⬜ Planned |
| Load tests (peak hour) | P2 | ⬜ Planned |

### Running Tests

```bash
pnpm test          # Run all tests
pnpm vitest run    # Run once (CI mode)
pnpm vitest        # Watch mode (development)
```

---

*Document generated for 9House Kitchen — Cloud-Kitchen Ordering Platform*  
*Architecture: React 19 + Express + tRPC + PostgreSQL + Drizzle ORM*
