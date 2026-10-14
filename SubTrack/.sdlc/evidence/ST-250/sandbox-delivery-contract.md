# ST250 executable sandbox delivery contract

2026-10-14. Proposed source freeze for independent platform/security plan review; this document authorizes no source or remote mutation by itself. ST250 currently permits metadata only. Constitution/DECISION_RULES, ST250 founder authority and accepted Billing Month design apply. No OpenClaw dependency.

## First beta outcome

Installable Android APK and iPhone TestFlight beta connect to a persistent VPS HTTPS backend. Each tester has isolated sandbox data. Clearly label Sandbox and Synthetic/simulated verification in Swedish and English. First beta supports account entry, profile/Just Me, personal subscription list, Add/Edit/status, Billing Month, renewals and logout. Changes survive API/container restart and a supported returning session. No real SMS/email, BankID, banks, purchases, production store release or live financial claims. Preserve current web source; a small static download gateway supplies only verified APK and TestFlight destinations. Synthetic bank/detection is enabled only after its own exact-head backend and installed-client qualification; otherwise the beta states unavailable without invented results.

## Identity boundary: prerequisite, not an implicit decision

The current private graph enrolls fixed Alice and returning login explicitly selects Alice. It must not be exposed. Security review must freeze a separate public sandbox identity model: unique server-created pseudonymous owner plus installation-held possession capability, or another reviewed isolated model. The capability is not a person/BankID/contact verification claim. Never accept caller owner/workspace/persona selectors as authority or share Alice's data. Proposed possession model needs a separate bounded founder security-model decision because accepted simulator ADR uses fixed personas. Do not request VPS/public-sandbox authorization again. Until that decision and review, infrastructure/build preparation proceeds; identity code and public exposure remain gated.

## Independent runtime and exact proposed source ownership

Following plan GO, amend ST250 allowed_paths with this finite roster before authors edit. Existing private proof graph and its fixed localhost/development/fixture gates remain unchanged; sandbox gets its own immutable environment tuple, keys, issuer/audience, schema bootstrap and ingress.

Backend author:
- `SubTrack/packages/contracts/openapi.yaml`
- `SubTrack/packages/contracts/sandbox-mobile.ts`
- `SubTrack/packages/contracts/tests/sandbox-mobile.test.mjs`
- `SubTrack/packages/contracts/package.json`
- `SubTrack/apps/api/src/sandbox/sandbox-config.ts` and `.spec.ts`
- `SubTrack/apps/api/src/sandbox/sandbox-authority.ts` and `.spec.ts`
- `SubTrack/apps/api/src/sandbox/sandbox-session.ts` and `.spec.ts`
- `SubTrack/apps/api/src/sandbox/sandbox-http.ts` and `.spec.ts`
- `SubTrack/apps/api/src/sandbox/main.ts`
- `SubTrack/apps/api/prisma/sandbox/001-sandbox-foundation.sql`
- `SubTrack/apps/api/prisma/sandbox/002-sandbox-mobile-business.sql`
- `SubTrack/apps/api/package.json`

Reuse canonical Money/domain and accepted business statements through their owner-transaction interface. Freeze the minimal authority/session interfaces after identity decision; no permissive rewrite of private authority or proof migrations. Sandbox DDL retains FORCE RLS, dual owner GUC validation, least-privilege runtime roles, composite owner foreign keys and immutable receipt semantics. Bootstrap role is used only during migration, never held by API workers. If additional shared source changes are necessary, review and amend paths explicitly rather than silently widening ownership.

Native author:
- `SubTrack/apps/mobile/app.config.ts`
- `SubTrack/apps/mobile/eas.json`
- `SubTrack/apps/mobile/src/config/sandboxRuntime.ts` and `.test.ts`
- `SubTrack/apps/mobile/src/api/sandboxMobileApi.ts` and `.test.ts`
- `SubTrack/apps/mobile/src/state/NativeSessionCore.tsx` and `.test.tsx`
- `SubTrack/apps/mobile/src/components/onboarding/SandboxEntry.tsx` and `.test.tsx`
- `SubTrack/apps/mobile/src/components/onboarding/RegistrationScreen.tsx` and `.test.tsx`
- `SubTrack/apps/mobile/src/components/onboarding/NativePersonalScreen.tsx` and `.test.tsx`
- `SubTrack/apps/mobile/app/_layout.tsx`
- `SubTrack/packages/i18n/catalogs/en.json` and `sv.json`

Release-mode sandbox selection requires explicit build variant plus canonical HTTPS origin; it must work with `__DEV__` false, reject web/production and never fall back to production URLs. Distinct sandbox application identifiers and display name prevent accidental production replacement. Resolve identifiers against Apple access before registering/signing. Private development CA and proof diagnostics stay out of sandbox builds. Reuse existing approved screens/tokens; no redesign.

Devops/build author:
- `SubTrack/infra/sandbox/compose.yaml`
- `SubTrack/infra/sandbox/Caddyfile`
- `SubTrack/infra/sandbox/sandbox.env.example`
- `SubTrack/infra/sandbox/Dockerfile.api`
- `SubTrack/infra/sandbox/gateway/index.html`
- `SubTrack/tools/sandbox/deploy.sh`
- `SubTrack/tools/sandbox/verify.sh`
- `SubTrack/tools/sandbox/build-android.sh`
- `SubTrack/tools/sandbox/build-ios.sh`
- `.github/workflows/subtrack-sandbox-build.yml`
- `SubTrack/docs/ops/SANDBOX.md`

## VPS deployment topology

Direct OS SSH targets `198.44.116.159` with existing configured key and login `openclaw`; the username is only an OS account. Never invoke OpenClaw software, agents/services, inspect its secrets or use its deployment directories. New independent root: `/home/openclaw/subtrack-sandbox`; Compose project `subtrack-sandbox`. Existing host services/listeners remain untouched.

Three services only: PostgreSQL16 with persistent private volume, sandbox API, and public trusted-TLS gateway. Database and API publish no host ports. Only gateway publishes80/443 after independent deployment review. Start budget: PostgreSQL256MiB, API384MiB, gateway96MiB; PID/CPU limits, restart policies, log rotation and total bounded log/storage retention. Confirm measured available memory at deployment; do not consume or kill unrelated processes to satisfy budget. Build images outside VPS and deploy digest-pinned artifacts; no unbounded VPS build/cache.

Use verified public-IP HTTPS with automated public-CA renewal if the selected pinned gateway version supports current IP ACME profiles. Validate chain and IP SAN from both phones; no self-signed/public tester CA install, TLS verification disable or invented domain. If no verified public IP certificate route is available, report that precise blocker; no domain purchase. API accepts only reviewed gateway ingress, canonical external host and bounded strict request framing; no reflected CORS, forwarded-header trust from arbitrary peers or exposing the private OTP callback.

## Artifacts and secret custody

Versioned output set: API image digest, migration checksum roster, sandbox variant manifest without secrets, Android signed release APK+SHA256, signed iOS archive/IPA custody record and verified TestFlight link when approved/available. Gateway links remain absent/unavailable until the corresponding actual artifact exists; never invent store IDs or destinations. APK signing key and API signing/identity/session keys are separate from production and persist across upgrades. API keys/passwords are generated/stored under dedicated permission0700 secret directory, files0600; Docker secrets or read-only mounts, no plaintext committed env, command echo, logs, artifacts or chat. Only founder/devops handles actual values. Backup and restore operate only sandbox data, with retained volume preserved on redeploy; destructive reset is separate explicit action.

## Zero additional cost build and distribution route

Android: existing Windows SDK/tooling or existing included CI runner builds a release APK, signs using sandbox keystore and deploys it to the verified gateway. No Play account or store upload needed. iOS: prefer existing included GitHub macOS runner entitlement to build/sign/archive and upload through verified App Store Connect access; existing Apple Developer membership is recorded, but team, bundle record, signing certificate/profile, API key and TestFlight access are not verified. Do not read/paste credentials or create accounts. An existing Expo/EAS account with included build capacity is an alternative only after access/quota verification; do not assume its existence/free capacity or use a paid build. No Mac purchase needed if included cloud signing route exists. External TestFlight distribution may require beta review; its approval time is outside implementation ETA. If included CI capacity or signing access is absent, report that exact dependency without spending. No real production App Store/Google Play publication.

## Concrete release gates

Contract-first source and independent security/platform reviews precede runnable beta. Meaningful changed-behavior tests cover sandbox/production variant separation, credential possession, cross-owner read/write denial, strict framing/rates, revocation, persistent restart readback and uncertain mutation handling. Required applicable CI remains blocking. Deployment uses isolated persistent database and demonstrates real HTTPS owner isolation, restart readback and logout; original private proof tests are not sandbox acceptance. Install actual Android APK and iPhone beta, visually inspect approved design and exercise Add/Edit/status/Month/logout against durable readback. Expose the download/test link only after security sign-off and the relevant artifact's actual availability. Record source-ready, deployed-backend, Android-installed and iPhone-installed states separately. First deliverable is the functioning isolated sandbox backend plus Android APK; iPhone signing/build progresses in parallel, with any Apple access/review dependency stated explicitly.
