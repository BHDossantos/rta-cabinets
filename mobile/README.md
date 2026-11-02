# Mobile readiness — 2026-11-02

Status: development preview, **not ready for App Store or Google Play submission**.

The native screen supports offline filtering of three sample finish descriptions,
matching the existing demo collections. It does not expose live prices or inventory.

Remaining product work: authenticated customer sessions with secure token storage
and revocation; authoritative catalog and inventory APIs; real quote/order flows;
payment provider integration; order status, cancellations and support; account
deletion and privacy controls. Confirm sample finish specifications before replacing
them with a live catalog. No checkout or stock claim is made in this preview.

## Reproducible local validation

Use Node 22 or newer:

```sh
cd mobile
npm ci
npm run typecheck
EXPO_OFFLINE=1 npx expo export --platform ios --platform android --output-dir dist
```

The PR workflow runs typechecking and both JavaScript bundle exports. Bundle export
is not a native Xcode/Gradle build, device test, signed release, or store approval.
The lockfile records the prototype's Expo SDK 54 dependencies. Review SDK currency,
security updates, platform target requirements and compatibility before release.

## Workspace evidence

Mobile typecheck and iOS/Android Hermes exports passed. Root typecheck passed;
root suite: 103 passed, 3 skipped (database integration coverage unavailable).

Exports used `EXPO_OFFLINE=1` because the Expo metadata fetch failed in this
environment. Native compilation, signed builds and device QA were not performed.

## Signing and release gate

`eas.json` defines internal preview and production build profiles with remote version
management. Submission profiles were intentionally omitted. No cloud builds were
started, credentials created, stores configured, or releases submitted.

Before an owner-authorized build: verify ownership of the bundle identifiers in
`app.json`, link the correct EAS project, supply existing iOS provisioning and Android
upload-key credentials through the approved signing service, and verify version/build
numbers. Then perform signed device builds and review their permissions and manifests.
Do not store credentials in git. Signing and store validation remain unverified.

Before public release also complete branded icons/splash/screenshots, accessible UI
and device QA, review notes/demo access, support and privacy URLs, privacy disclosures,
data-safety declarations, account deletion where accounts exist, and functional
acceptance tests. This small preview alone is not sufficient product functionality
for submission.
