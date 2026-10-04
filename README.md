# RTA Cabinet Factory Platform

This is the foundation for the RTA Cabinet Factory platform. Customers plan a renovation, get manufacturable cabinet layouts, see a server-computed itemized price, and check out with staged (bodies first, fronts later) delivery. The factory receives only approved, paid, reviewed orders.

It implements the **R0 Foundation / R1 controlled-commerce pilot core** from the development handoff, `docs/spec/RTA_Cabinet_Factory_Development_Handoff_v1.0.docx`. It is a working, tested base, not the finished enterprise scope. See [`docs/traceability.md`](docs/traceability.md) for what is covered and what is still to do.

> **All catalog data, prices, discounts, tax rates, freight and tolerances in this repo are synthetic test fixtures** (handoff section 32). Business decisions D01–D30 remain open; see [`docs/decisions.md`](docs/decisions.md).

## Quick start

```bash
npm install
npm test            # domain and API test suite
npm run typecheck
npm run dev:api     # http://localhost:8787 (in-memory unless DATABASE_URL is set)
npm run dev:web     # http://localhost:5173 (proxies /api to :8787)
```

### Keeping data across restarts

Set `DATABASE_URL` to a PostgreSQL 14+ database and the API saves every change before it responds. Migrations run automatically on startup, and an empty database is seeded with the demo data:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/rta npm run dev:api
```

Run one API instance per database; a second instance is refused at startup. Database tests run when `TEST_DATABASE_URL` points at a server where the test user can create databases (CI provides one).

Demo users (a development stub, sent in the `x-user-id` header): `u_home` (homeowner), `u_pro` (Pro with trade pricing), `u_factory` (factory planner), `u_admin`. Guests get an `x-guest-token` when they create a project.

No payment provider is connected yet. In development, the order page has **Simulate successful / declined payment** buttons. They send the server a simulated provider notification for the order's server-side total, and they are disabled when `NODE_ENV=production`.

## Layout

| Path | What |
|---|---|
| `packages/core` | Domain engine: units, geometry, layout rules, surfaces, pricing, design-to-cart, inventory, fulfillment, leads, memberships, revisions and release gates |
| `apps/api` | HTTP API implementing the section 24 contract (projects, revisions, validation, quotes, carts, idempotent checkout, signed webhooks, release, shipments, directory, leads, financing referrals, catalog import staging) |
| `apps/web` | React storefront, accessible 2D planner (numeric and drag placement), estimate, cart/checkout, installer directory, financing referral |
| `db/migrations/` | Migrations applied by the API on startup (pilot persistence) |
| `db/schema.sql` | Normalized PostgreSQL target schema with the integrity constraints from section 23 |
| `docs/` | Architecture, decision register, traceability matrix, catalog CSV template, original handoff |

## Roadmap (from the handoff)

- **R0 Foundation:** business decisions, factory catalog, rules, UX prototype, integration proofs. *This repo provides the rules, data model, prototype and test harness; the factory data and decisions are still needed.*
- **R1 Pilot:** standard kitchen catalog, 2D planner, manual designer review, design cart, payments, staged shipments, accounts, annual Pro, directory, financing referral.
- **R2:** guided auto-layout, more rooms and finishes, CRM, lead assignment, ERP sync, validated cut lists.
- **R3:** custom furniture, framing, CNC adapters, advanced Pro tiers, white-label, trade credit.
- **R4:** marketplace sellers, settlement, embedded designer, public APIs.

First team action (handoff section 33): assign decision owners, get the factory's real SKU/BOM package, and walk one standard kitchen from measurement through two-stage delivery.
