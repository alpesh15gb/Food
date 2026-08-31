# 9House Kitchen Product-Gap Roadmap

## Executive Position

The current application is a **clean direct-ordering foundation**, not yet a fully operational restaurant system. Its immediate weakness is not visual polish; it is the lack of a fast, safe path from a real restaurant menu to live customer ordering. The sequence below prioritizes operational readiness over feature breadth.

> Rista’s public product position combines direct ordering with menu control, order operations, inventory, customer growth, reporting, and integrations. The appropriate response for 9House Kitchen is a staged build, not an attempt to clone an entire POS immediately. [1] [2]

| Priority | Gap | Current 9House Kitchen state | Recommended scope | Acceptance signal |
|---|---|---|---|---|
| **P0** | Menu onboarding | Empty clean baseline; individual add-item workflow only | CSV/XLSX menu import, downloadable template, preflight validation, category mapping, image URL support, dietary and availability fields, import preview, row errors, publish confirmation | Owner imports a real menu in one session without database access or developer intervention. |
| **P0** | Core menu controls | Basic item availability only | Category ordering, item variants/modifiers, in-stock scheduling, publish/unpublish, search, bulk availability, import history and rollback | Kitchen can change an item’s sellability in under a minute. |
| **P0** | Mobile operations | Desktop-side navigation is weak on a phone | Bottom sheet or compact mobile navigation, persistent operational status, clear primary action, responsive table replacement with cards | Owner can import, publish, pause items and view incoming orders from a phone. |
| **P0** | Secure integration activation | Status cards exist; no actionable setup workflow | Provider checklist, environment-key status, sandbox/live mode, test connection, credential configuration through server-managed secret storage, audit trail | Owner knows exactly what is missing and can finish secure setup without source-code edits. |
| **P1** | Order-to-kitchen operation | Schema and basic status exist | New-order alerting, KDS queue, preparation timers, accept/reject reasons, cancellation/refund workflow, printable/WhatsApp receipts | Every paid order is acknowledged, prepared, and closed with an audit event. |
| **P1** | Customer checkout | Payment adapter exists but providers are inactive | OTP, address book, serviceability, Razorpay test-to-live, delivery partner dispatch and status webhooks | A customer can complete a real controlled order end-to-end. |
| **P1** | Restaurant configuration | Basic settings exist | Business hours, delivery zones/fees, pickup policy, tax, kitchen prep timing, legal/support contacts, brand assets | Storefront behavior follows settings rather than hard-coded defaults. |
| **P1** | Analytics | Headline operational metrics only | Daily sales, channel/order source, AOV, cancellation, item performance, order SLA, export | Owner can make a daily operating decision from the dashboard. |
| **P2** | CRM and retention | No live customer data yet | Consent management, customer profiles, feedback, loyalty, promotional segmentation, WhatsApp campaigns | Marketing is opt-in, targeted and based on real purchase history. |
| **P2** | Inventory and recipe costing | Not implemented | Ingredient catalog, recipes, stock ledger, supplier purchase records, low-stock rules, wastage and variance | Item availability can reflect actual ingredient stock. |
| **P2** | POS/table operations | Out of scope currently | Table map, QR ordering, tabs, cashier billing, split payments, KOT printer/KDS integration | Dine-in can run alongside direct delivery without a separate system. |
| **P3** | Multi-outlet and multi-brand | Data model supports one outlet only in UX | Outlet switcher, branch-level menus, kitchen routing, central reporting, transfers | Multiple kitchens can operate without cross-outlet mistakes. |

## Recommended Delivery Sequence

| Release | Objective | Features |
|---|---|---|
| **Release A — Onboard & Publish** | Make the store genuinely configurable | Import wizard, menu template, bulk review/publish, categories, modifiers, mobile admin navigation, integration setup checklist. |
| **Release B — Transact & Fulfil** | Convert and service real customer orders | OTP, Razorpay sandbox/live workflow, address/serviceability, order/KDS queue, delivery dispatch/status, receipts. |
| **Release C — Operate & Learn** | Give the kitchen operational control | Hours/zones/taxes, reporting, audit log, roles, data export, basic customer relationship records. |
| **Release D — Optimise & Scale** | Add Restaurant-OS capabilities | Ingredient/recipe inventory, procurement, CRM/loyalty, table QR/POS and multi-outlet controls. |

## Explicit Security Decision for Credentials

The requested “credential fields” should not become normal database form fields. Payment, OTP and delivery secrets must remain server-side, encrypted and absent from browser source, logs, exports and ordinary staff roles. The improved admin experience should instead provide a **guided configuration workflow**: “required key”, “current state”, “where to configure”, “sandbox/live”, “last connection test”, and “which administrator configured it.” This matches the operational convenience of a provider setup page without turning the admin database into a secret store.

## Rista Capability References

[1]: https://ristaapps.com/ "Rista — Restaurant Software"
[2]: https://dotpe.in/rista-restaurant-management-software.html "Rista Restaurant Management Software"
[3]: https://ristaapps.com/restaurant-direct-ordering-system "Rista Direct Ordering"
[4]: https://ristaapps.com/restaurant-inventory-management "Rista Inventory Management"
