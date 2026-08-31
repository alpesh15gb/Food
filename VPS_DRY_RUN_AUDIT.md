# VPS Dry-Run Audit — 26 August 2026

The existing VPS is a **shared production host**. The inventory was read-only; no running service, Nginx configuration, firewall rule, DNS record, container, port binding, or application file was changed.

| Area | Observed state | Dry-run implication |
|---|---|---|
| Host | Ubuntu 24.04.4 LTS, Docker 29.7.2, Docker Compose 5.5.0, Node 20.20.2 | Suitable for a containerized, isolated test stack. |
| Capacity | 15 GiB RAM with approximately 11 GiB available; 136 GiB free root storage | Adequate for a small test application plus an isolated database. |
| Shared traffic | Nginx terminates active HTTP/HTTPS traffic for multiple applications | No global Nginx change, restart, or port rebinding should be used for testing. |
| Existing 9house site | `9housekitchen.in` and `admin.9housekitchen.in` currently proxy to a healthy `9house-front` container on `127.0.0.1:4200`; API traffic proxies to `127.0.0.1:8020/8021` | The production domain cannot be reused for Supperclub testing without replacing an active site. |
| Safe candidate ports | `4100`, `4101`, `4201`, `4300`, and `4301` were free at inspection time | A new test container can bind a loopback-only port such as `127.0.0.1:4300`. |
| App compatibility | Supperclub currently uses MySQL/TiDB schema tooling and managed OAuth/runtime environment variables | A complete VPS dry run requires an isolated MySQL-compatible database and a VPS-compatible authentication/secrets configuration; it is not a direct copy of the managed runtime. |

> Recommended dry-run boundary: deploy a standalone container stack under `/opt/supperclub-direct`, bind only to `127.0.0.1:4300`, use a separate MySQL-compatible database and volume, and expose it only through a new temporary host after explicit approval. The existing `9housekitchen.in` configuration remains untouched.

## Explicit approval required before any remote change

The following operations are intentionally pending approval: creating `/opt/supperclub-direct`; copying code; creating containers, volumes, an isolated database, or environment files; adding a temporary Nginx virtual host; obtaining a temporary TLS certificate; reloading Nginx after a successful syntax test; and creating or changing DNS records.

## Cutover Result

The legacy 9house traffic containers were stopped only after their routing and container metadata were captured under `/root/legacy-9house-backup-20260826-1050`. Supperclub Direct was then deployed as its own `deploy-app-1` and `deploy-db-1` containers, with the application exposed only on `127.0.0.1:4300`. The `9housekitchen.in` virtual host now proxies to that loopback service and passed both local HTTPS and public browser checks at `/burger-district`.

The legacy Nginx configuration, images, uploads, volumes, database, Redis instance, and stopped containers remain in place for rollback. The live `/admin` route now exposes the VPS-local administrator passphrase entry point, while payment, customer OTP, and delivery integrations remain intentionally unconfigured pending the owner’s provider credentials.

## Clean Production Reset

The live isolated Supperclub database was reset to a clean `9House Kitchen` baseline. The current database contains one restaurant record, one configuration-only menu category, and zero menu items, coupons, orders, cart records, customer records, or payment records. Browser inspection of the root domain confirms that customers see **9House Kitchen**, the “menu is being prepared” state, and no seeded dishes, ratings, testimonials, orders, addresses, or offers.

The final public-copy check also confirms that the direct root domain title is **9House Kitchen | Direct Ordering** and the visible interface uses neutral configuration language rather than prior restaurant, locality, address, coupon, or order samples.

The final route checks confirm that `/admin` exposes the protected administrator passphrase entry page and that the former customer cart route now resolves to the neutral “Service setup underway” message. Therefore no customer-facing demo cart, coupon, checkout, sample order, or sample address state remains reachable before genuine kitchen configuration is added.

## Operations Upgrade Verification

The Rista-informed operations upgrade has been deployed to the isolated VPS runtime. The new menu import endpoint was verified through an authenticated preview of a non-persistent row: it validated successfully and did not create a menu item. The provider vault was verified with a one-time non-production probe: the value was encrypted at write time, readable only by the server-side verification procedure, omitted from API responses, and then removed. No provider key, customer data, order, coupon, menu item, or other demonstration record remains in the production database.

The `deploy/redeploy-vps.sh` procedure now recovers the isolated application’s existing runtime values before recreating its container and aborts if any required value is unavailable. This preserves the database, session, administrator and vault-encryption boundaries through future deployments.
