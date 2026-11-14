# Homepage image provenance — 13 November 2026

The previous homepage used photographic crops from `kitchen-reference.jpg`, a copy of the supplied Custommock reference. That asset has been removed from the deployable public directory. The reference is no longer fetched, cropped, or used by the homepage.

Every homepage photographic background now uses one of three newly generated images. Generated with OpenAI's built-in image generation tool, text-only prompts, no input/reference images. The PNG outputs were encoded to WebP (quality 86), without compositing or deriving pixels from the supplied reference. This records provenance, not a guarantee of exclusive copyright in AI output.

- `kitchen-white-original.webp`: imaginary sunlit kitchen with warm-white Shaker cabinets, natural oak island, limestone counters, brass hardware, large windows, warm oak flooring. Used for hero and white inspiration cards.
- `kitchen-neutral-original.webp`: imaginary bright modern kitchen with mushroom-gray recessed-panel cabinets, quartz counters, nickel pulls, central island, black pendant lights, light wood floor. Used for neutral inspiration cards.
- `kitchen-espresso-original.webp`: imaginary compact kitchen with espresso wood Shaker cabinets, white stone counters, brass handles, stainless range, peninsula and two oak stools. Used for espresso inspiration cards.

Each prompt specified a landscape 3:2 photorealistic architectural concept, realistic functional geometry, no people, text, logos, watermark or collage, and no reproduction of an existing photograph. The page explicitly labels them as AI-generated concepts, not completed installations or available catalog representations.

The layout, navigation, planner and sample-data disclosure remain unchanged. No pricing, payment, demo-auth, backend or deployment settings changed.

## Verification

TypeScript typecheck, production build and 107 Vitest tests passed; three database tests were skipped. All three generated images were visually inspected. Final WebP assets total approximately 493 KiB versus 2.5 MiB for the removed reference. No reference image remains in deployable source/public assets. Desktop/mobile browser QA was attempted, including permitted escalation, but Chromium cannot create its local singleton socket in this executor (`socket() failed: Operation not permitted`). The prepared smoke check has not passed; this is a draft awaiting browser QA and merge, not a claimed production deployment.
