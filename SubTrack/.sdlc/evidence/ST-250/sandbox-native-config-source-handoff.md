# ST-250 — Native sandbox build configuration handoff

2026-10-14. Author changed only the four frozen native configuration/test paths. Source preparation only; no authority/client API/screens/signing/store registration, Git, remote or build/distribution execution. Independent review required before curation. Founder subsequently adopted the isolated identity proposal; this configuration still does not wire or enable that unimplemented runtime.

Explicit `SUBTRACK_APP_VARIANT=sandbox` requires canonical candidate origin `SUBTRACK_SANDBOX_HTTPS_ORIGIN=https://198.44.116.159`. Only the verified VPS candidate is allowed; no endpoint availability/TLS claim. Unknown/empty variants and noncanonical/unapproved origins fail configuration. Variant absent returns Expo's incoming default config unchanged, preserving current development/production/private-proof behavior. Local name/slug/scheme and identifiers become SubTrack Sandbox/subtrack-sandbox/se.subtrack.app.sandbox; these are local build intent, not verified Apple/Google records.

Sandbox excludes the private CA config plugin and rejects all private device-proof, CA, fixture, enrollment and diagnostic environment inputs (even false/empty present values). It publishes only nonsecret preparation metadata with literal runtime/publication/privateDiagnostics false. The pure native preparation resolver accepts iOS/Android in development or release equally; its public runtime resolver always returns null. No existing auth/runtime gate is broadened or fallback introduced. Actual bundle exclusion/installed behavior remains a later build gate; exclusion here means plugin exclusion and rejection of its enabling environment, not a claim that every diagnostic module has been tree-shaken.

Official current [Expo configuration contract](https://docs.expo.dev/workflow/configuration/) and [variant guidance](https://docs.expo.dev/build-reference/variants/) checked 2026-10-14; actual installed Expo51/@expo/config9.0.4 loader was exercised. App config is self-contained and imports only an erased Expo config type, avoiding a new TS loader/dependency. A separate pure resolver is intentionally not imported into Expo51's TS config; tests cover their same finite approved origin roster.

Actual checks:

- Node helper four substantive tests PASS using actual installed Expo config loading: existing static fields/default private-plugin missing-CA rejection preserved; sandbox identifier/plugin/false-marker separation; invalid variants/origins; private environment contamination rejection. Initial test incorrectly enabled the existing private plugin without a CA and was corrected to assert its existing failure, not alter source behavior.
- Focused Jest sandboxRuntime:25 tests PASS with enforced100% statement/branch/function/line coverage. Both platforms and `development=false`/true preserve preparation and deny runtime. Invalid origins/platform/variant have no fallback. Initial CLI JSON quoting issue was corrected using Jest's structured runCLI; no test ran under that rejected invocation.
- Mobile `tsc --noEmit` PASS. Separate semantic app.config.ts check PASS (it is outside current mobile tsconfig includes); its first run exposed absent local Node global types, resolved with an erased minimal readonly environment declaration without new dependencies.
- Scoped four-file ESLint PASS; helper's initial missing process global was resolved with explicit node:process import.

Local coverage output is verification custody only and must not be curated. No full unchanged test suite was repeated. Next step is independent configuration/source review, then actual approved runtime/client implementation and separate native build/signing gates.

## Final SHA256 roster

The conductor should independently check all four actual hashes before commit (final erased environment declaration included).

apps/mobile/app.config.ts 019157dd0b5880aafd6962bccb5d9256e7d5d161f20ccfe821935e22f6a90b73
apps/mobile/scripts/sandbox-app-config-test.mjs ea938a394ccf33df4edda2fc5c3d9dae98778fae6ca52949e9bbf998b6ce8e0a
apps/mobile/src/config/sandboxRuntime.ts 84f325c8331fce9a856b9e8962001164f8bd2b2ca765b9d7a90fec47d867cc4f
apps/mobile/src/config/sandboxRuntime.test.ts 4af99dfb354358e03292196fc90dff9b666c898a8f1464caa9b7832d401cf0f5
