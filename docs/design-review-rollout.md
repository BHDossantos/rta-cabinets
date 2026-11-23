# Design review and storefront rollout

## What this draft covers
- Try the measured 2D kitchen example, build a layout, then open the itemized estimate.
- Prepare a review, not an order. The planner saves the project; signed-in customers must explicitly submit the existing design request form to record it in the app. Guests can keep a local copy and sign in to continue. A request record is not proof a salesperson has been assigned or notified.
- A staff account can open the attached saved revision and attest wall/cabinet clearances, door/appliance swings, and window interference. Automated validation is supplemental, not a site measurement or approval.
- The preview checkout rejects planner-linked carts without that human review. Edited designs or diverging item lists cannot use the old attestation. Checkout in this code is mocked only; no real charge, inventory workflow or order confirmation is launched by this change.

## Requirements before a live launch
- Assign a staffed queue and a response process, verify staff access, persist and audit requests in the actual deployment, and test customer-to-staff-to-customer handoff with sandbox accounts. Design amendments need a new attestation; publish clear measurement responsibilities.
- Treat supplier examples as sourcing references, not SKUs or image licenses. Confirm item-specific box and drawer construction (including proposed 5/8, 3/4 and 1 inch plywood); distinguish nominal and actual dimensions. Confirm supplier/item/finish, hardware and slide compatibility, DIY kit contents, quantity, price and inventory before listing. No warranty or longevity claims yet.
- Start bathroom, closets, outdoor aluminum and garage with verified assortments and original or licensed imagery. Treat White Shaker, Natural Oak and Brushed Aluminum artwork as clearly labeled illustrations until matched to actual products. Do not use sourcing reference thumbnails without rights.
- Translate complete shared navigation and the checkout/review flow before presenting an EN/PT/ES language choice as supported. Keep Chinese out of the first launch.
- Keep holiday promos off until there is an approved creative, eligible products and a verified discount. Design for human review at least 7 days ahead of start in the intended US storefront timezone; no scheduling by default.
