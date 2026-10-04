# Architecture (R0/R1 foundation)

This follows handoff section 22: a **modular monolith** with an API-first backend, explicit domain boundaries and background workers added once real integrations exist.

```
packages/core   Pure TypeScript domain library. No I/O. Runs in the browser and on the server.
  units         canonical mm, fractional-inch parsing and display
  money         integer cents, basis points, explicit half-up rounding
  geometry      room polygon checks, wall segments, footprints, SAT overlap
  catalog       SKU master data, production eligibility, staged CSV import
  design        versioned DesignDocument, stable JSON for content hashes
  rules         versioned rule engine: blocker / review_required / advisory, overrides
  surfaces      floor, wall and paint pack math with visible formulas
  pricing       server price authority, quote contract, quote revalidation
  cart          design → commercial lines, divergence, incomplete systems
  state         orthogonal state machines (payment, manufacturing, shipment, ...)
  inventory     ATP, all-or-nothing reservations with expiry
  fulfillment   staged groups (A bodies / B fronts), shipment validation
  leads         directory eligibility, claim, redacted lead views
  membership    subscription entitlement, renewal dedupe, 30-day access window
  projects      immutable revisions, optimistic concurrency, approvals, release gate
apps/api        HTTP adapter (node:http) plus in-memory repositories standing in for db/schema.sql
apps/web        React + Vite storefront, 2D planner, cart/checkout, directory, financing
db/schema.sql   PostgreSQL system-of-record design (checked against PostgreSQL 16)
```

## Principles enforced in code

- **The server is the pricing authority.** `POST /api/quotes` and checkout ignore client-sent prices and entitlements (AC12.2, AC16.1).
- **Geometry is the source of truth.** The rule engine uses a single canonical unit (mm). SKUs are never resized to fit; a wall change triggers revalidation (Example A, AC08.2).
- **Approval, payment, factory release and shipment are separate.** `releaseGate()` requires the approved revision and its content hash, settled payment, a cleared factory review, zero blockers and production-eligible SKUs (Example E).
- **Idempotency everywhere money or production is touched.** Checkout requires an `Idempotency-Key` header. Webhooks are HMAC-verified and deduplicated by event ID. Release is idempotent per order.
- **Nothing unknown is shown as zero.** Quotes carry `taxStatus`, `shipping.status`, `excluded[]` and `isEstimate`.
- **No cross-tenant probing.** Inaccessible objects return 404.

## Going to production (next steps)

1. **Done for the pilot:** durable PostgreSQL persistence (`apps/api/src/persistence.ts`, `db/migrations/`). The API keeps its working state in memory. Mutating requests run one at a time, and each one's changed rows are written in a single transaction before the response is sent. If that write fails, memory is reloaded from the database and the client gets a 503, so nothing is half-saved. An advisory lock allows one API instance per database. **Next, for scale-out:** move to the normalized `db/schema.sql` with per-route transactions, `SELECT … FOR UPDATE` reservations and the unique indexes shown there, which allows several API instances and SQL reporting.
2. Replace the `x-user-id` development auth with the chosen identity provider (D24). The header is a dev stub and **must not** ship.
3. Put payments behind a provider adapter (hosted checkout or fields). Keep the webhook receipt table and signature check.
4. Add the transactional outbox worker for events (`OrderPaid`, `OrderReleased`, …) and ERP/WMS adapters once D22/D23 are decided.
5. Load the factory's real SKU/BOM package through the staged import. Fixture SKUs must never reach production.
