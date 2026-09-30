# Requirement traceability

Maps the handoff's acceptance criteria (AC) and QA scenarios to code and automated tests. **Covered** means an automated test asserts the behavior. **Partial** means the domain logic exists but the full product flow (UI, provider or persistence) is still to do. **Not started** is shown so nothing is silently dropped.

## Worked examples (handoff section 32)

| Example | Test |
|---|---|
| A: standard wall layout (fits 120", fails 119", no SKU shrink, 8 ft suggestion ≠ measurement) | `packages/core/test/rules.test.ts` › Example A |
| B: pack quantities (137 sq ft → 8 packs, 160 sq ft) | `packages/core/test/commerce.test.ts` › Example B |
| C: retail $748.00 and member $683.20, expiry needs acceptance | `packages/core/test/commerce.test.ts` › Example C |
| D: split delivery; Stage A delivered = partially delivered; replacement allowance | `packages/core/test/operations.test.ts` › Example D |
| E: revision integrity (approval bound to rev 7; rev 8 not releasable) | `packages/core/test/operations.test.ts` › Example E |

## Acceptance criteria

| AC | Status | Where |
|---|---|---|
| AC03.1 Object-ID editing never reveals other accounts | Covered (API) | `apps/api/test/api.test.ts` › access control. The API returns 404, not 403. |
| AC03.2 Expired membership changes trade pricing, keeps history | Covered (core) | `operations.test.ts` › memberships |
| AC03.3 Factory user sees no financing data | Partial | Financing data is never attached to orders. Role views are not built yet. |
| AC03.4 Removed staff lose access | Not started | `organization_member.revoked_at` exists in the schema |
| AC06.1 Guest registers and resumes the identical design | Covered | `api.test.ts` › guest design |
| AC06.2 Failed registration keeps the draft | Partial | The guest token persists until the claim succeeds |
| AC06.3 Concurrent edits give a recoverable conflict | Covered | `operations.test.ts`, `api.test.ts` › project saves |
| AC06.4 Expired access blocks edits at the API | Partial | `projectAccess()` exists but is not wired into the save route |
| AC08.1 Unit round-trip within tolerance | Covered | `units.test.ts` |
| AC08.2 No cabinet silently embedded after a room edit | Covered | `rules.test.ts` |
| AC08.3 Undo restores placement, finish and quantities | Partial | Web planner history stack |
| AC08.4 Open outline or missing appliance blocks validation | Covered | `rules.test.ts` |
| AC08.5 Mobile numeric placement without a mouse | Partial | Web planner numeric form. Device testing is outstanding. |
| AC09.1 Collisions caught | Covered | `rules.test.ts` (same wall and corners) |
| AC09.2 No retired or incompatible SKU without a blocked state | Covered | `rules.test.ts` |
| AC09.3 Renderer outage keeps the project | Partial | Rendering is 2D SVG only, and state lives on the server |
| AC09.4 Reproducible validation | Covered | `rules.test.ts` (order-independent output) |
| AC09.5 2D, BOM and cart agree | Partial | `commerce.test.ts` › design to cart (instance links) |
| AC11.1 Approved revision immutable | Covered | `operations.test.ts` › Example E |
| AC11.2 Cart references the approved revision; detects superseded ones | Covered | Checkout compares the content hash and flags material changes |
| AC11.4 Customer approval alone cannot release | Covered | `releaseGate()` and the API e2e test |
| AC12.1 Identical carts get identical totals | Covered | `commerce.test.ts` |
| AC12.2 Client prices ignored | Covered | `api.test.ts` › server-side pricing |
| AC12.3 Expired membership forces the approved reprice policy | Covered | `commerce.test.ts` › Example C |
| AC12.4 Removed hinge or front gives an incomplete system | Covered | `commerce.test.ts`, `api.test.ts` e2e |
| AC12.6 Proposals state what is pending | Covered | `Quote.isEstimate`, `taxStatus`, `shipping.status`, `excluded` |
| AC15.1 Last-unit contention gives one allocation | Covered | `operations.test.ts` (in-process); DB design uses `FOR UPDATE` |
| AC15.2 Stage A delivered = partially delivered | Covered | core and API e2e |
| AC15.4 Replacement links to the original line | Covered | `validateShipment` replacement allowance |
| AC15.5 Replayed carrier events don't regress status | Covered | `applyCarrierStatus`, API e2e |
| AC16.1 Retail can't get wholesale prices via parameters | Covered | `api.test.ts` |
| AC16.2 Paid but unverified members get no directory badge | Covered | `operations.test.ts`, `api.test.ts` |
| AC16.3 Canceled keeps access until paid-through | Covered | `operations.test.ts` |
| AC16.4 Duplicate renewals don't double-extend | Covered | `operations.test.ts` |
| AC18.1 Out-of-area pros can't claim | Covered | `operations.test.ts` |
| AC18.2 Customer-selected requests reach only the chosen pros | Covered | `api.test.ts` |
| AC18.3 One winner for an exclusive claim | Covered | core, plus the `lead_claim_exclusive_one` partial unique index |
| AC19.3 Replayed release doesn't duplicate production | Covered | API release is idempotent; `production_job.release_key UNIQUE` |
| AC19.x BOM, CNC export and part labels | Not started | R2/R3. Depends on D16 and D22. |

## QA scenarios (handoff section 27)

| QA | Status |
|---|---|
| QA01 guest → register → resume | Covered |
| QA02 wall resize after placement | Covered |
| QA03 missing appliance dimensions | Covered |
| QA04 BOM, quote, cart and drawings reconcile | Partial (quote and cart reconcile; there is no BOM yet) |
| QA05 removed accessory | Covered |
| QA06 last unit sold concurrently | Covered |
| QA07 double-click and replayed callback | Covered |
| QA08 payment after reservation expiry | Covered (moves to `reconciliation`) |
| QA09 financing statuses | Partial (state machine only, no provider) |
| QA10 membership expiry with a saved quote | Covered (core) |
| QA11 two pros claim an exclusive lead | Covered |
| QA12 altered object IDs | Covered (API) |
| QA13 bodies delivered while fronts are in production | Covered |
| QA14 dimensions changed after release | Partial (`materialChanges`; no change-order flow yet) |
| QA15–QA20 ERP replay, claims, refunds, device fallback, a11y audit, restore drill | Not started |
