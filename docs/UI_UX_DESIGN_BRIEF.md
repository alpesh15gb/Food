# UI/UX Design Brief — 9House Kitchen

**Version:** 1.0  
**Date:** August 31, 2026  
**Domain:** 9housekitchen.in  
**Design Codename:** "Market Table" — rice-paper surfaces, tamarind-red actions, ticket textures

---

## 1. Design Philosophy

### Core Principles

1. **Warm & Appetizing** — Food ordering is emotional. Every surface should feel inviting, not clinical.
2. **Rice-Paper Texture** — Surfaces have subtle grain and warmth, like a physical menu or order ticket.
3. **Tamarind Red Actions** — Primary actions use a warm, deep red (`#C84630`) that evokes spice and appetite.
4. **Ticket Edges** — Cards and panels use clipped corners (octagonal clip-path) resembling order tickets.
5. **Generous Whitespace** — Content breathes; no cramped layouts.
6. **Mobile-Native Feel** — The web app should feel like a native food-ordering app on phones.

### What This Is NOT

- NOT a Swiggy/Zomato clone — no orange/green brand colors, no identical layouts
- NOT a generic SaaS dashboard — the admin panel has warmth, not cold blues
- NOT a dark-mode-first design — light mode is the primary experience

---

## 2. Brand Identity

### Brand Name

**9House Kitchen** (also referred to as "Spice Garden" in the initial deployment)

### Brand Voice

| Attribute | Description |
|-----------|-------------|
| Tone | Warm, confident, inviting |
| Language | Simple, direct, appetizing |
| Personality | Like a knowledgeable chef who loves feeding people |

### Logo

- **Primary mark:** A simple, warm icon (current: utensils-in-circle with tamarind-red)
- **Text lockup:** "Spice Garden" in DM Serif Display (serif) with "OPERATIONS DESK" in Manrope (sans-serif) uppercase
- **Minimum clear space:** 1.5× the icon height on all sides
- **Minimum size:** 32×32px icon, 120px wide text lockup

### Brand Colors

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Primary (Tamarind Red)** | Deep warm red | `#C84630` | CTAs, active states, brand accent |
| **Primary Hover** | Darker red | `#AD3627` | Button hover states |
| **Primary Light** | Soft peach | `#F7E4D3` | Backgrounds, badges, highlights |
| **Background** | Warm off-white | `#FFFAF3` | Page background |
| **Surface** | Cream white | `#FFFDF9` | Card backgrounds |
| **Surface Alt** | Warm ivory | `#FFF9F3` | Alternate card backgrounds |
| **Text Primary** | Dark brown | `#382719` | Headings, primary text |
| **Text Secondary** | Medium brown | `#704D37` | Body text, descriptions |
| **Text Muted** | Warm gray-brown | `#9E765E` | Labels, captions |
| **Border** | Warm tan | `#EAD8C6` | Card borders, dividers |
| **Border Light** | Light tan | `#F0E4D9` | Subtle dividers |
| **Success** | Forest green | `#42774B` | Success states, veg indicator |
| **Warning** | Amber | `#9C5A21` | Bestseller badges, warnings |
| **Error** | Crimson | `#A44230` | Errors, destructive actions |
| **Dark Panel** | Deep brown | `#38271F` | Sidebar, dark cards, footer |

### Color Usage Rules

| Context | Color |
|---------|-------|
| Primary CTA button background | `#C84630` |
| Primary CTA button text | White `#FFFFFF` |
| Primary CTA button hover | `#AD3627` |
| Active category pill | `#382719` (dark brown bg, white text) |
| Inactive category pill | White bg, `#EAD8C6` border, `#76523E` text |
| Active filter chip | `#C84630` bg, white text |
| Inactive filter chip | White bg, `#EAD8C6` border |
| Card background | `#FFFDF9` |
| Card border | `#EAD8C6` |
| Page background | `#FFFAF3` |
| Section label | `#9E765E` (uppercase, 10px, extrabold, tracked) |

---

## 3. Typography

### Font Stack

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| **Display** | DM Serif Display | 400, 700 | Headings, hero text, screen titles |
| **Body** | Manrope | 400, 500, 600, 700, 800 | All body text, labels, buttons |

### Type Scale

| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Display XL | 48px (3rem) | 400 | 1.1 | Hero headline |
| Display LG | 40px (2.5rem) | 400 | 1.15 | Screen title |
| Display MD | 32px (2rem) | 400 | 1.2 | Section title |
| Display SM | 24px (1.5rem) | 400 | 1.25 | Card title |
| Body LG | 16px (1rem) | 500 | 1.5 | Primary body text |
| Body MD | 14px (0.875rem) | 500 | 1.5 | Secondary text, descriptions |
| Body SM | 12px (0.75rem) | 500 | 1.5 | Captions, helper text |
| Label | 11px (0.6875rem) | 800 | 1.5 | Section labels, uppercase |
| Label XS | 10px (0.625rem) | 800 | 1.6 | Tiny labels, badges |
| Label XXS | 9px (0.5625rem) | 800 | 1.6 | Tag labels |

### Typography Rules

- **Section labels** are always: 10px, uppercase, `tracking-[0.16em]`, color `#9E765E`
- **Card titles** use DM Serif Display (serif), Manrope for everything else
- **Prices** are always bold (extrabold in Manrope)
- **All interactive text** (buttons, links, tabs) is 600-800 weight

---

## 4. Spacing & Layout

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight spacing (inline elements) |
| `space-2` | 8px | Small spacing (icon + text gaps) |
| `space-3` | 12px | Card internal padding |
| `space-4` | 16px | Standard card padding, gap between elements |
| `space-5` | 20px | Section padding |
| `space-6` | 24px | Section gaps |
| `space-8` | 32px | Large section gaps |
| `space-10` | 40px | Page-level padding (desktop) |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-xl` | 12px | Buttons, inputs, small cards |
| `rounded-2xl` | 16px | Cards, dialogs |
| `rounded-[1.35rem]` | 21.6px | Menu item cards |
| `rounded-2xl` | 16px | Collection cards, offer banners |
| `rounded-full` | 9999px | Pills, badges, status dots |

### Ticket Edge Effect

The signature "ticket edge" uses a CSS clip-path:
```css
.ticket-edge {
  clip-path: polygon(
    0.9rem 0, calc(100% - 0.9rem) 0,
    100% 0.9rem, 100% calc(100% - 0.9rem),
    calc(100% - 0.9rem) 100%, 0.9rem 100%,
    0 calc(100% - 0.9rem), 0 0.9rem
  );
}
```
Applied to: Cart sidebar, checkout cards, order cards, confirmation panel.

### Paper Grain Texture

Subtle dot pattern overlay on certain panels:
```css
.paper-grain {
  background-image: radial-gradient(
    rgba(91, 58, 36, 0.06) 0.7px,
    transparent 0.7px
  );
  background-size: 8px 8px;
}
```
Applied to: Cart header, checkout header, login card.

---

## 5. Layout System

### Storefront Layout

#### Mobile (≤ 640px)

```
┌─────────────────────────┐
│  TopBar (sticky)         │  64px height
├─────────────────────────┤
│  Hero Banner             │  280px min-height
├─────────────────────────┤
│  Delivery Address Bar    │  ~56px
├─────────────────────────┤
│  Offer Banner (scroll)   │  ~72px
├─────────────────────────┤
│  Search Bar              │  48px
├─────────────────────────┤
│  Category Pills (scroll) │  ~40px
├─────────────────────────┤
│  Filter Chips (scroll)   │  ~40px
├─────────────────────────┤
│  Menu Items              │  Full width cards
│  (stacked vertically)    │
│                          │
├─────────────────────────┤
│  Mobile Cart Bar (fixed) │  ~64px (when items in cart)
│  Bottom: 16px margin     │
└─────────────────────────┘
```

#### Desktop (≥ 1024px)

```
┌──────────────────────────────────────────────────────────────┐
│  TopBar (sticky)                                              │
├──────────────────────────────────────────────────────────────┤
│  Hero Banner (full width)                                     │
├──────────────────────────────────────────────────────────────┤
│  Delivery Address Bar                                         │
├──────┬──────────────────────────────────┬────────────────────┤
│      │                                  │                    │
│ Cat  │  Search + Filters                │  Cart Sidebar      │
│ Side │                                  │  (sticky)          │
│ bar  │  Menu Items                      │                    │
│      │                                  │  - Items           │
│ 170px│  (flex-1)                        │  - Price breakdown │
│      │                                  │  - Checkout button │
│      │                                  │                    │
│      │                                  │  350px             │
├──────┴──────────────────────────────────┴────────────────────┤
│  Footer                                                       │
└──────────────────────────────────────────────────────────────┘
```

#### Max Width

| Breakpoint | Content Width |
|-----------|--------------|
| Mobile | 100% (full width) |
| Tablet | 100% (full width) |
| Desktop | Max 1440px, centered |

### Admin Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Header (sticky)                                              │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                    │
│ Sidebar  │  Main Content Area                                 │
│ (sticky) │                                                    │
│          │  - Section header (title + actions)                │
│ 240px    │  - Content (cards, tables, forms)                  │
│          │                                                    │
│ Collapsible│ Max 1280px, centered                             │
│ to 64px │                                                    │
│          │                                                    │
├──────────┴───────────────────────────────────────────────────┤
│  User info at bottom of sidebar                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Component Library

### Buttons

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| **Primary** | `#C84630` | White | None | Main CTAs (Checkout, Save, Add) |
| **Primary Hover** | `#AD3627` | White | None | Hover state |
| **Outline** | Transparent | `#704D37` | `#D8BDA7` | Secondary actions (View storefront) |
| **Ghost** | Transparent | Current | None | Navigation, close buttons |
| **Destructive** | `#C84630` | White | None | Cancel, reject, delete |

**Button sizes:**

| Size | Height | Padding | Font Size |
|------|--------|---------|-----------|
| Default | 36px (h-9) | 16px horizontal | 14px |
| Large | 40px (h-10) | 24px horizontal | 14px |
| Extra Large | 48px (h-12) | 24px horizontal | 14px |
| Icon | 36px (h-9) | — | — |

**Button behavior:**
- `transform: scale(0.97)` on `:active` (press feedback)
- 160ms cubic-bezier transition on all properties
- Disabled: `opacity: 50%`, `pointer-events: none`

### Cards

| Type | Background | Border | Radius | Shadow | Usage |
|------|-----------|--------|--------|--------|-------|
| **Menu Card** | `#FFFDF9` | `#EAD8C6` | 21.6px | `0 6px 18px rgba(89,55,31,0.05)` | Menu items |
| **Cart Card** | `#FFFDF8` | — | Ticket edge | `0 15px 35px rgba(84,48,26,0.1)` | Cart sidebar |
| **Collection Card** | `#FFFDF9` | `#EAD8C6` | 16px | `sm` | Horizontal scroll cards |
| **Admin KPI** | `#FFFDF9` | — | 16px | `sm` | Dashboard metrics |
| **Admin Order** | `#FFFAF5` | `#EADCCF` | 12px | None | Order pipeline items |
| **Offer Card** | `#FFF9F0` → `#FFF3E5` | `#E8D6C5` | 16px | None | Promotion banners |

### Input Fields

| Property | Value |
|----------|-------|
| Height | 44px (h-11) |
| Border | 1px solid `#DDC6B5` |
| Border radius | 12px (rounded-xl) |
| Background | White |
| Focus ring | 2px solid `#C84630` |
| Font size | 14px (text-sm) |
| Padding | 12px horizontal |

### Status Badges

| Status | Background | Text | Shape |
|--------|-----------|------|-------|
| Active/Paid | `#E5F1E5` | `#42774B` | Rounded pill |
| Pending | `#F7E5D7` | `#A74C34` | Rounded pill |
| Error/Failed | `#FEE2E2` | `#DC2626` | Rounded pill |
| Neutral | `#F3F4F6` | `#374151` | Rounded pill |
| Bestseller | `#F7E6CA` | `#9C5A21` | Rounded pill, 10px |
| Customizable | `#F7E6CA` | `#97591F` | Rounded pill, 10px |

### Dietary Indicators

| Type | Symbol | Background | Text |
|------|--------|-----------|------|
| Veg | V | `#DCFCE7` (green-50) | `#16A34A` (green-700) |
| Non-Veg | NV | `#FEE2E2` (red-50) | `#DC2626` (red-700) |
| Egg | E | `#FEF3C7` (amber-50) | `#D97706` (amber-700) |

### Toggle Switches

| State | Track | Thumb |
|-------|-------|-------|
| Off | `#E5E7EB` (gray-200) | White |
| On | `#C84630` (tamarind red) | White, translated right |

---

## 7. Spacing Patterns

### Card Internal Padding

| Card Type | Padding |
|-----------|---------|
| Menu card (mobile) | 16px |
| Menu card (desktop) | 20px |
| Cart sidebar | 20px |
| Admin KPI card | 20px |
| Admin order row | 16px horizontal, 16px vertical |

### Section Gaps

| Context | Gap |
|---------|-----|
| Between menu cards | 12px |
| Between admin KPI cards | 16px |
| Between admin sections | 24px |
| Between sidebar and content (admin) | 32px (lg) |
| Between grid items | 16px (mobile), 20px (desktop) |

### Page Padding

| Breakpoint | Horizontal | Vertical |
|-----------|-----------|---------|
| Mobile | 16px | 20px |
| Tablet | 24px | 20px |
| Desktop | 40px | 32px |

---

## 8. Animation & Motion

### Transitions

```css
button, a, input {
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1),
              background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
              border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
              box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
```

### Micro-interactions

| Element | Interaction | Effect |
|---------|------------|--------|
| Button press | `:active` | `scale(0.97)` — subtle press |
| Card hover | `:hover` | `translateY(-2px)` — lift effect |
| ADD button | Click | Scale down then back, toast notification |
| Cart badge | Count change | Number updates instantly |
| Category pill | Tap | Background fills from outline to solid dark |
| Filter chip | Tap | Background fills from outline to tamarind red |

### Page Load Animation

```css
.rise-in {
  animation: rise-in 420ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

@keyframes rise-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
```
Applied to: Hero banner content on initial load.

### Skeleton Loading

| Element | Skeleton Style |
|---------|---------------|
| Cards | Rounded rectangles, `bg-[#EADFD4]`, animate-pulse |
| Text lines | Rounded rectangles at 60% and 40% width |
| Full page | Stacked skeleton blocks matching layout |

---

## 9. Responsive Behavior

### Breakpoints

| Name | Width | Layout Changes |
|------|-------|---------------|
| Mobile | < 640px | Single column, bottom cart bar, horizontal scroll pills |
| Tablet | 640px - 1023px | 2-column grids, no sidebar |
| Desktop | ≥ 1024px | 3-column layout, sidebar cart, category sidebar |
| Wide | ≥ 1280px | Max-width container, more breathing room |

### Mobile-Specific Patterns

| Pattern | Implementation |
|---------|---------------|
| Sticky header | `position: sticky; top: 0; z-index: 40` |
| Bottom cart bar | `position: fixed; bottom: 16px; left: 16px; right: 16px; z-index: 40` |
| Horizontal scroll categories | `overflow-x: auto; flex; gap: 8px; hide-scrollbar` |
| Pull-to-refresh | Not implemented (web limitation) |
| Touch targets | Minimum 44×44px for all interactive elements |

### Desktop-Specific Patterns

| Pattern | Implementation |
|---------|---------------|
| Sticky sidebar | `position: sticky; top: 96px` (below header) |
| 3-column grid | `grid-cols-[170px_minmax(0,1fr)_350px]` |
| Max-width container | `max-w-[1440px] mx-auto` |
| Hover states | Card lift, button background change |

---

## 10. Iconography

### Icon Library

**Lucide React** — all icons from `lucide-react`

### Common Icons

| Icon | Usage | Size |
|------|-------|------|
| `ShoppingBag` | Cart, orders | 16-20px |
| `Search` | Search input | 16px |
| `MapPin` | Delivery address | 16px |
| `Clock3` | Time, ETA | 14-16px |
| `ChevronRight` | Navigation arrow | 16px |
| `ArrowRight` | CTA arrow | 16px |
| `ArrowLeft` | Back navigation | 16px |
| `Plus` | Add item | 16px |
| `X` | Close, dismiss | 16px |
| `Check` | Success, confirm | 16-20px |
| `TicketPercent` | Coupons, offers | 16-20px |
| `Bike` | Delivery | 14px |
| `UtensilsCrossed` | Menu, food | 20px |
| `ClipboardList` | Orders | 20px |
| `CookingPot` | Kitchen, preparing | 20px |
| `BarChart3` | Analytics | 20px |
| `LockKeyhole` | Auth, security | 24px |
| `ExternalLink` | Open in new tab | 14px |
| `Sparkles` | Collections, featured | 16px |

### Icon Color Rules

| Context | Color |
|---------|-------|
| Active nav icon | `#C84630` |
| Inactive nav icon | Current text color |
| Status success | `#42774B` |
| Status warning | `#D97706` |
| Status error | `#DC2626` |
| Muted icons | `#9E765E` |

---

## 11. Accessibility

### Color Contrast

| Pair | Ratio | WCAG AA |
|------|-------|---------|
| `#382719` on `#FFFAF3` | 12.5:1 | ✅ Pass |
| `#C84630` on `#FFFFFF` | 5.2:1 | ✅ Pass |
| `#704D37` on `#FFFAF3` | 6.8:1 | ✅ Pass |
| `#9E765E` on `#FFFAF3` | 3.9:1 | ⚠️ Large text only |

### Focus Management

- All interactive elements have visible focus rings: `focus-visible:ring-[3px] focus-visible:ring-[#C84630]`
- Focus ring offset: 2px
- Skip-to-content link (planned)

### Keyboard Navigation

- All buttons and links are focusable
- Tab order follows visual order
- Custom dropdowns (select) are native HTML for keyboard support

### Screen Reader Support

- Semantic HTML: `<header>`, `<main>`, `<section>`, `<nav>`, `<article>`
- `aria-label` on icon-only buttons: `aria-label="Open cart"`
- `role="alert"` on error messages
- Alt text on images (when images are provided)

### Touch Targets

All interactive elements meet the 44×44px minimum:
- Buttons: 36-48px height
- Toggle switches: 44×24px
- Category pills: 40px height
- Filter chips: 40px height

---

## 12. Admin Panel Design

### Sidebar

| Property | Value |
|----------|-------|
| Width (expanded) | 240px |
| Width (collapsed) | 64px |
| Background | `#FFFFFF` |
| Border right | `1px solid #EAD8C6` |
| Active item bg | `#FFF0ED` (peach) |
| Active item text | `#C84630` |
| Inactive item text | `#5F4534` |
| Section label | 10px, uppercase, `#9E765E` |

### Dashboard Cards

| Property | Value |
|----------|-------|
| KPI card bg | `#FFFDF9` |
| KPI card radius | 16px |
| KPI icon bg | Varies by metric (peach, green, purple, gold) |
| KPI value font | DM Serif Display, 30px |
| KPI label | 14px, `#7D5E4C`, semibold |

### Order Table

| Property | Value |
|----------|-------|
| Table header bg | `#F8EFE6` |
| Header text | 10px, uppercase, `#9B7861` |
| Row border | `1px solid #F0E4D9` |
| Row hover | `#FFF9F3` |
| Row padding | 20px horizontal, 16px vertical |
| Status badge | Rounded pill, colored per status |

### Admin Dark Panels

| Element | Background | Text |
|---------|-----------|------|
| Add Item form | `#38271F` | White |
| Restaurant status card | `#38271F` | White |
| Section label in dark | `#E7B99D` | — |

---

## 13. Toast Notifications

| Type | Background | Icon | Usage |
|------|-----------|------|-------|
| Success | Green | ✅ Check | Item added, settings saved |
| Error | Red | ❌ X | Validation error, API failure |
| Info | Blue | ℹ️ | Informational messages |

**Position:** `top-center`  
**Duration:** Auto-dismiss after 3-4 seconds  
**Rich colors:** Enabled (colored backgrounds per type)

---

## 14. Loading States

### Skeleton Screens

| Screen | Skeleton Pattern |
|--------|-----------------|
| Menu page | Header block (80px) → Hero block (280px) → 6 card blocks (128px each) |
| Admin dashboard | Header block → 4 KPI blocks → Pipeline block → Table block |
| Order list | Header block → Filter bar → 8 row blocks |

**Skeleton color:** `#EADFD4` (warm tan)  
**Animation:** `animate-pulse` (opacity oscillation)

### Inline Loading

| Context | Indicator |
|---------|----------|
| Button action | Button text changes to "Processing..." + disabled |
| Page load | Full skeleton screen |
| Data fetch | Component-level skeleton or spinner |

---

## 15. Empty States

### Menu Empty

```
🍽️ (utensils icon in peach circle)
"The menu is being prepared"
"The kitchen team will publish dishes shortly."
```

### Order List Empty

```
🫕 (cooking pot icon in tamarind circle)
"The counter is clear for now"
"New customer orders will appear here as soon as they're placed."
```

### Cart Empty (in sidebar)

```
"Your cart is empty"
"Browse the menu to add items"
```

---

## 16. Image Handling

### Menu Item Images

| Property | Value |
|----------|-------|
| Aspect ratio | 1:1 (square) |
| Border radius | 16px |
| Placeholder bg | `#F3E5D4` (warm tan) |
| Object fit | `cover` |
| Max width (mobile) | 112px |
| Max width (desktop) | 140px |
| Overlay (sold out) | `#3A251B` at 45% opacity with white text |

### Hero Banner

| Property | Value |
|----------|-------|
| Height (mobile) | 280px min |
| Height (desktop) | 320px min |
| Overlay gradient | Left-to-right: `#1A1210/95` → `#2B1E16/80` → `#2B1E16/30` |
| Text color | White with varying opacity |
| Object fit | `cover` |

---

*Document generated for 9House Kitchen — Cloud-Kitchen Ordering Platform*  
*Design system: "Market Table" — rice-paper surfaces, tamarind-red actions, ticket textures*
