# Competitive research: 20 cabinet manufacturer and RTA websites

Researched 2026-10-07. **Method:** the sites could not be opened directly from the build environment, so this is based on search-engine summaries of each site's own pages (home, samples, design service, FAQ, contractor and shipping pages) plus some third-party reviews. Feature presence is verified from indexed content, not from browsing the live sites. A 30-minute manual click-through of Kitchen Cabinet Kings, RTA Cabinet Store, Lily Ann, Barker and Home Decorators is recommended before final UX sign-off. No copy, prices, testimonials or images were taken from these sites; only the patterns are described.

## Sites reviewed

| Site | Type | What stands out |
|---|---|---|
| Kitchen Cabinet Kings | RTA + assembled e-tailer | Average "10x10 price" on every door style; samples credited back to the cabinet order; free design in 1–2 days; "ready to ship" tier |
| RTA Cabinet Store | RTA e-tailer | RTA vs assembled toggle with a per-cabinet fee; free design with CAD files and spec sheets; order lookup by order number and ZIP; published damage-claim steps; contractor portal |
| The RTA Store | RTA e-tailer | Cheap samples with the first few shipped free and credited to the order; trade program with dedicated designer |
| Lily Ann Cabinets | RTA e-tailer | Quick Order by SKU; 3-step design intake with up to 10 uploads and measuring tips inside the form; 10-ft and 10x10 price guides |
| Barker Cabinets | US factory-direct custom RTA | Per-cabinet width/height/depth inputs with live price; full-size sample doors |
| Cabinets.com | Multi-brand retailer | No-obligation design intake; designer profile pages; refundable samples; two financing plans side by side |
| CabinetSelect | RTA e-tailer | Optional assembly fee; free-shipping threshold; showroom by appointment |
| Home Decorators Cabinetry (Home Depot) | Manufacturer configurator | Free depth reduction in 1" steps; end-panel choice explained; "Express" quick-ship tier; dedicated construction page |
| IKEA Kitchen Planner | Planner | Saved plans; PDF export; automatic item list; paid planning appointment |
| Lowe's (Diamond, KraftMaid, Shenandoah) | Retailer | Visualizer, style quiz and cost estimator as one funnel; video consultation |
| KraftMaid | Manufacturer | Room visualizer swapping door profile and finish; style quiz; dealer locator |
| Semihandmade | Fronts maker | Upload another planner's PDF for a quote; virtual consultations |
| Nieu Cabinet Doors | Fronts maker | Lead-time guarantee; sample kit |
| Scherr's | Custom RTA factory | Exact-size boxes and doors; quote form |
| Cabinet Joint | Built-to-order RTA | Pricing explainer by kitchen size |
| Forevermark (via dealers) | RTA manufacturer | Construction specs and certifications published consistently |
| J&K Cabinetry | Manufacturer/wholesaler | Construction as a selling point; assembly guides and videos |
| Fabuwood (via dealers) | Manufacturer | Visualizer; spec brochure; collections in price tiers |
| Wolf Home Products | Manufacturer | Warranty document per line; spec sell sheets |
| Nobilia / Häcker | European manufacturers | Planner with live prices on mobile; quick configurator from sample layouts plus full planner |

## Most common patterns (out of 20)

Door-style collections (20) · sample doors (15) · free design service (14) · construction/spec pages (13) · warranty pages (10) · learning guides (10) · financing (9) · lead-time or quick-ship tiers (9) · assembly guides (9) · free-shipping threshold (8) · pro program (8) · measuring guide (8) · RTA vs assembled option (7) · 10x10 price benchmark (6) · cabinet modifications (6) · order tracking (5) · damage claims (5) · saved designs/dashboard (4) · 2D/3D planner (4) · quick order by SKU (3).

## Adoption on this site

| # | Feature (best example) | Status here |
|---|---|---|
| 1 | Door-style collections with 10x10 price and comparison (Kitchen Cabinet Kings) | **Built** — `/collections`. The 10x10 price is computed by the server's pricing engine from a published list of cabinets, so it stays correct when prices change. |
| 2 | Free design service intake (Lily Ann, RTA Cabinet Store) | **Built** — `/design-service` intake, attach saved design, in-app clarifications, designer queue and state machine. File uploads still to do (needs private file storage). |
| 3 | Sample doors (The RTA Store, Kitchen Cabinet Kings) | **Built** — order a sample from each collection. Credit-back of sample cost is **waiting on a business decision** (amount and cap). |
| 4 | Lead time / stock badges (Home Decorators, Nieu) | **Built** — collection pages show stocked bodies (live stock) and made-to-order fronts with the lead time. Lead times are fixtures until the factory supplies them. |
| 5 | Quick order by SKU with bulk paste (Lily Ann, Conestoga) | **Built** — `/quick-order`: paste lines like `B36 2`, validated against the live catalog, then added to the cart. |
| 6 | Saved designs and account dashboard (IKEA, Nobilia) | **Built** — `/account`: saved designs, orders, design requests. |
| 7 | 2D planner to cart with export (IKEA, Nobilia) | **Built earlier** — planner, server estimate, design cart, JSON/print export. |
| 8 | Measuring guide (Lily Ann) | **Built** — `/measure`, printable with worksheet. |
| 9 | Installer directory (Home Outlet) | **Built earlier** — verified-only directory, customer-selected requests. |
| 10 | RTA vs assembled toggle and fee (RTA Cabinet Store) | Needs factory data: assembly fee, assembled lead time, return rule. |
| 11 | Cabinet modifications (Barker, Home Decorators) | Needs factory data: allowed modifications, limits and fees. The rule engine already blocks anything outside approved sizes. |
| 12 | Construction / spec page and spec sheets (Forevermark, Home Decorators) | Needs factory data: real materials, thicknesses, certifications. |
| 13 | Financing messages (Cabinets.com) | Needs a financing partner (D25). Referral form built earlier. |
| 14 | Shipping calculator and free-shipping threshold (Kitchen Cabinet Kings) | Needs freight rates and threshold (D24). |
| 15 | Order lookup without login and photo damage claims (RTA Cabinet Store) | Needs shipping-address capture at checkout and file storage; claim state machine already exists. |
| — | Reviews, galleries, designer profiles, live chat | Only with real, verified content; nothing invented. |
