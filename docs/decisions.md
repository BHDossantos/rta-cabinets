# Decision register

Status of the business and factory decisions from handoff sections 30–31. **OPEN** decisions are not settled by this code. Where the code needs a value to run, it uses the handoff's *proposed default* as swappable configuration or a synthetic fixture. Nothing here sets real prices, fees, discounts, tolerances or lender rules.

| ID | Decision | Status | How the code handles it today |
|----|----------|--------|--------------------------|
| D01 | Free homeowner account vs paid 12-month membership | OPEN | Basic account and paid entitlements are separate (`membership.ts`). No fee is hardcoded. |
| D02 | What starts the 30-day window, and what happens after it | OPEN | `projectAccess()`: the window is data. Proposed default: the clock starts at the first saved project, then access becomes read-only with export. |
| D03 | Annual only, or monthly and annual Pro tiers | OPEN | `PlanConfig.interval` supports both. The fixture has one annual pilot plan with `priceCents: null`. |
| D04 | Plan prices, limits, discounts and renewal rules | OPEN | Held centrally as configuration (`FIXTURE_PLANS`, `PricingPolicy`). The 10% trade discount is a synthetic test fixture only. |
| D05 | Which release is the contracted first launch | OPEN | This repo is the R0/R1 foundation. See the README roadmap. |
| D06 | Who owns Pro-created client designs | OPEN | `Project.ownerType` supports `organization`. Sharing needs an explicit grant (`project_access_grant`). |
| D07 | What Free Design includes | OPEN | The design-request state machine exists. Entitlements are not modelled yet. |
| D08 | Are quotes price-locked across membership expiry? | OPEN | `revalidateQuote()` honors a quote only when it is locked **and** unexpired. Otherwise it reprices and asks the customer to accept the new total. The API uses reprice-with-acceptance. |
| D09 | Does membership alone allow directory listing and leads? | Proposed: no | `searchDirectory()` requires verification **and** an active entitlement (AC16.2). |
| D10 | Lead modes | Proposed: customer-selected pilot | The API exposes customer-selected leads. Core also implements claimable, auto-assigned and private modes. |
| D11 | Who invoices materials and installation | Proposed | Factory sells materials; the installer contracts labor separately. |
| D12 | Guest checkout and deposits | OPEN | Guest carts are supported by token. Deposits are not implemented. |
| D13 | Returns and cancellations for custom parts | OPEN | Not implemented. It blocks payment collection for custom orders. |
| D14 | Launch markets | Inferred US/USD | `Currency = 'USD'`. Regions are not modelled yet. |
| D15 | Gallery and branding ownership | OPEN | The web app uses no third-party imagery or copy. |
| D16 | Approved sizes and construction systems | **Blocking for production** | All SKUs are `FIXTURE-*` synthetic data. Replace them through the CSV import (`docs/catalog-import-template.csv`). |
| D17–D21 | Custom scope, Stage A/B contents, material and room matrix, measurement owner, countertops | OPEN | Countertops are `quote_required`. Stage A/B is a per-SKU `fulfillmentStage`. |
| D22 | ERP, WMS, CAM and CNC systems | OPEN | No adapters yet. The outbox and webhook tables are in the schema. |
| D23 | Inventory and price system of record | OPEN | `InventoryLedger` is in-process. The DB design uses `FOR UPDATE` reservations. |
| D24 | Payment, tax, shipping and subscription providers | OPEN | A mock provider uses an HMAC-signed webhook. Tax uses fixture rates. Freight is a synthetic flat $100 at checkout and `pending_quote` elsewhere. |
| D25–D26 | Financing partner and programs | OPEN | Lead-referral mode only, with consent evidence. Sensitive fields are rejected. |
| D27 | Framing engineering authority | OPEN | Not implemented (R3). |
| D28 | Marketplace seller model | OPEN | Seller state machine only (R4). |
| D29–D30 | Scale, recovery and data retention | OPEN | Proposed budgets are in the handoff (section 25). Nothing has been measured yet. |

Record each decision in this format: ID, chosen rule, accountable person, approval date, effective release, affected requirements, operational impact, examples.
