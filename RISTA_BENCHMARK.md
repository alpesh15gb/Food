# Rista Benchmark — Initial Product Gap Evidence

## Scope

This benchmark compares the current 9House Kitchen direct-ordering and operations experience with the public capabilities described by Rista. It is a **capability benchmark**, not a claim that every Rista feature is required for 9House Kitchen on day one.

| Rista capability area | Publicly described capability | Relevant 9House Kitchen implication |
|---|---|---|
| Direct ordering | Branded direct ordering, dine-in/QR, pickup, delivery, payment and customer data ownership. [1] | The current app needs a genuine restaurant setup, real menu, channel choice and actual payment/delivery activation before customer ordering can begin. |
| Menu operations | Central menu status, material-based stock-out controls, and channel-specific combos, variants and options. [2] | The current one-by-one menu editor is insufficient. Prioritize spreadsheet import, validation/preview, modifiers, category structure, availability, and outlet/channel publishing. |
| Order operations | Central incoming-order visibility and an accept-to-dispatch order lifecycle. [2] | Add a kitchen queue, permissions, status SLAs, cancellation/refund controls, and notification handoffs before relying on operations at scale. |
| Back-of-house | Recipe/ingredient usage, inventory, purchase activity, supplier analytics, transfers, audits, wastage and low-stock signals. [3] | Keep this as a later module after the ordering core; first establish recipes and basic stock/availability links so the menu does not oversell. |
| Customer growth | CRM, segmentation, loyalty, offers, WhatsApp campaigns, customer insights, and reporting. [1] | Add consented customer profiles, transactional notifications and targeted promotions only after live ordering provides real data. |
| Multi-location control | Centralized menu and inventory management across outlets and brands. [1] [2] | Preserve the current outlet data model, but defer multi-outlet controls until 9House operates more than one location. |
| Mobile operations | Restaurant functions accessible across devices; Rista describes a mobile-first POS approach. [2] | The current desktop-first sidebar must become an explicit mobile navigation pattern with task-focused views. |
| Integrations | Delivery, payments, online channels, POS/aggregator sync, accounting/marketing tools. [1] [2] | The integrations area should show connection state, required configuration, testing state and setup instructions—while credentials remain in server-side secret storage. |

## Initial Assessment

9House Kitchen now has a direct-domain storefront, a protected operations entry point, a domain data model, an order status model, and a credential-ready payment boundary. It does **not** yet have the operational completeness of a restaurant platform: production menu loading, menu import/review, actual payment and delivery provider activation, kitchen workflow, role management, customer messaging, reporting, inventory, and a robust mobile operations experience are gaps.

The highest-leverage immediate improvement is the **menu onboarding path**. It should let an operator import a structured menu file, preview all rows, flag invalid categories/prices/dietary labels/options, resolve errors, and publish selected items. This is materially safer and faster than manually creating a large menu item-by-item.

## References

[1]: https://ristaapps.com/ "Rista — Restaurant Software"
[2]: https://dotpe.in/rista-restaurant-management-software.html "Rista Restaurant Management Software"
[3]: https://ristaapps.com/restaurant-inventory-management "Rista Inventory Management"
[4]: https://ristaapps.com/restaurant-direct-ordering-system "Rista Direct Ordering"
