# Mobile readiness audit (2026-10-21)

## Verdict

The active `claude/wonderful-knuth-xnuxec` branch is a React/Vite web storefront plus a Node API and shared domain engine, not a shipping native application. Existing CI passed at `6bb7028fd8d632385893df8d7310bcbf2dd4dbfb` ([run](https://github.com/BHDossantos/rta-cabinets/actions/runs/38761783193)). This does not establish phone UX or store readiness.

The separate `mobile/rta-foundation` branch contains an Expo 54 starter with one placeholder screen. It does not integrate the catalog, planner, account/session, cart or checkout workflows, has no mobile lockfile, and is behind active application work. Do not merge it wholesale or treat its app identifiers as verified store ownership. Jennifer's actual Expo app is a useful structural reference, not a substitute for these product flows.

## Automation added

`.github/workflows/mobile-web.yml` tests the existing product on Android Chrome and iPhone Safari browser profiles with Playwright. It builds the web app, uses the local fixture API without a database or production accounts, and checks:

- Phone-width overflow, menu close/reopen, navigation and browser Back/Forward.
- Product details opened, closed and reopened, including Escape dismissal.
- Planner entry and switching away from and back to account creation.

It preserves failure screenshots/traces and an HTML report for seven days. The Playwright dependency and lockfile are isolated under `tools/mobile-smoke`; no new production dependency is introduced. This is mobile-web validation only, not native emulator/device testing, payment certification or app-store approval.

## Run locally

```sh
npm ci
npm run build -w @rta/web
npm ci --prefix tools/mobile-smoke
npx --prefix tools/mobile-smoke playwright install --with-deps chromium webkit
npm --prefix tools/mobile-smoke test
```

For a preinstalled Chromium, set `MOBILE_CHROMIUM_EXECUTABLE` and select `--project android-chromium`. CI uses the bundled matching browsers. Tests refuse to reuse an existing server, so an unrelated local instance cannot accidentally receive fixture actions.

## Remaining release gates, in order

1. Choose the mobile product scope and native implementation. The existing React web planner cannot simply be imported into React Native; decide whether to build native screens or intentionally support a web-based shell. Preserve the shared domain/API contracts.
2. Implement and test mobile authentication, session persistence/expiry, guest-cart migration, API origin, file downloads/sharing, keyboard/safe areas, navigation, offline/error recovery and the actual planner-to-cart flow.
3. Verify package/bundle ownership, Expo project, assets, signing and store accounts. Then add reproducible native exports/prebuild checks, debug/simulator builds and device journeys. No identifiers or credentials were created by this audit.
4. Replace synthetic catalog/pricing and test payments with owner-approved factory data and a real provider. The README explicitly identifies these as demo fixtures. Account email verification/password-reset delivery and business decisions remain separate requirements.
5. Validate on physical iPhone/Android devices, review privacy/data declarations and storefront content, then explicitly approve any signed build and submission.

## Verification for this change

- Passed locally: clean install, TypeScript check, Vite production build, 103 domain/API tests. Three database-specific tests were skipped because no test database was supplied.
- Browser execution is pending a capable runner: local Chromium cannot create its required IPC socket, and browser archive downloads were incomplete. A requested sandbox escalation failed before execution. No browser journey is being claimed as passed.
- Existing CI remains intact. Review the new PR checks before merging. No build service, production deployment, signing or store submission was invoked.
