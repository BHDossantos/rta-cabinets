# Storefront banner operations

The shared carousel has three internally configured evergreen slides and uses manual previous/next controls, not auto-rotation. It is shown on storefront and project-planning pages, omitted from private account/order screens and print layouts. It uses original artwork in the component and has no campaign toggle, external dependency, tracking, price, or discount logic.

The current app has no staff campaign approval record or verified commercial promotion source. Do not turn holiday ideas into live banners by copying them into this component. To add campaigns later:

- Use an explicit, default-off storefront feature flag and store the real approved creative, eligible SKUs, inventory and pricing/discount authority on the server.
- Require an identified staff reviewer to approve the exact campaign revision at least seven full days before display. Changing any material field invalidates the approval.
- Record the US market timezone, start/end times, approver and approved timestamp. Enforce the window server-side, fail closed on missing/late approval, and fall back to evergreen guidance if revoked or expired.
- Test disabled, draft, late approval, before start, active, expiry and emergency disable in a staging deployment. Do not run a live example.

No holidays, creative, SKUs, discounts or promotions are enabled by this draft.
