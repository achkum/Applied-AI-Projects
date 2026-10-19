# ST-250 — Executable first-beta native client contract

2026-10-14. Client architecture proposal after reading actual NativeSession/Core, private API/storage, Personal, Billing Month, Renewals, router and strict `@subtrack/contracts/sandbox-mobile` source. **ARCHITECTURE GO for this finite source direction**, pending independent platform review and conductor path freeze. No source edits, tests, Git, remote or activation in this phase. ADR0035 adoption supplies sandbox guest authority; production/private auth remains unchanged.

## One executable feature slice

SandboxEntry → new or returning isolated workspace → existing profile/Just Me flow → existing Personal Add/Edit/status → existing Billing Month and30-day renewals → acknowledged workspace logout. Reuse approved components, typography/tokens, icons, canonical Money parsing/formatting and pure projection selectors. No alternative mock dashboard, redesigned screens, provider buttons or copied financial arithmetic. Persisted owner readback, not the mutation receipt alone, updates display. Always display bilingual Sandbox/simulated-verification/fictional-input notice. Existing private/default app behavior remains the default.

## Exact proposed source ownership

Freeze only the following paths before implementation (all prefixed `SubTrack/` in task ownership):

- `apps/mobile/src/api/sandboxMobileApi.ts` and `.test.ts`
- `apps/mobile/src/api/sandboxMobileProjections.ts` and `.test.ts`
- `apps/mobile/src/utils/secureSandboxBundle.ts` and `.test.ts`
- `apps/mobile/src/state/SandboxSessionCore.ts` and `.test.ts`
- `apps/mobile/src/state/SandboxSession.tsx` and `.test.tsx`
- `apps/mobile/src/components/onboarding/SandboxEntry.tsx` and `.test.tsx`
- `apps/mobile/src/components/onboarding/NativePersonalScreen.tsx` and `.test.tsx`
- `apps/mobile/src/components/billing/NativeBillingMonthScreen.tsx` and `.test.tsx`
- `apps/mobile/src/components/home/NativePersonalRenewalsScreen.tsx` and `.test.tsx`
- `apps/mobile/app/_layout.tsx`, `index.tsx`, `personal.tsx`, `personal-home.tsx`, `personal-billing-month.tsx`
- `packages/i18n/catalogs/en.json`, `sv.json`

Keep the four already frozen sandbox build configuration/test paths available solely for compatible metadata decoding/testing if needed; public runtime activation stays false. NativeSession/Core, secureSessionBundle, privateMobileApi, EnrollmentFlow, private gate/diagnostics and bank/detection screens stay outside this slice. If a new shared helper/path proves necessary, request conductor amendment before editing; do not broaden scope silently.

## Reuse approved screens through explicit dependency ports

Current Personal screen directly calls `useNativeSession` and private API functions; Month/Renewals directly call that hook and private projection loaders. Add narrow optional, immutable dependency props with existing private hook/API/loaders as defaults. For example Personal receives `useSession` (the common phase/run/login/logout/refresh facade), its finite business method object and a sandbox presentation marker; Month/Renewals receive the same session hook and their typed projection reader. The hook is called unconditionally at the top of the component; its selected implementation is immutable for the mounted variant, never conditionally selected after an async response. Do not pass sandbox credentials to NativeSessionCore or override private API URL resolution.

Sandbox route wrappers supply `useSandboxSession`, sandbox business methods and projection readers. Private wrappers/default tests retain their existing dependencies. Shared facade exposes phase, generic serialized `run(accessToken,signal)` and actions only; it exposes no owner, capability, refresh secret or mutable credentials to UI. `login` in the sandbox facade means explicit capability resume and is labelled accordingly, never BankID. Sandbox inactive Personal content renders SandboxEntry instead of the private verify/register controls. Hide bank/detection navigation and detected-row actions in this first beta; server does not return those sources. Month/Renewals keep approved details, totals, accessibility and navigation, with the sandbox notice and existing active-phase gates.

Existing pure `selectBillingMonth`, `selectNativeRenewals`, civil-date validation and Money functions are reused directly. New sandbox projection readers load current profile/mode and bounded owner pages through sandbox business API, reject duplicate IDs/cursor loops/obsolete aborted results and cap collected rows at the server's50-owner-row ceiling. They call the canonical selectors and preserve undated/date/status semantics. They never call private transport readers or infer transactions/charge history.

## Separate persistent native authority

SandboxSessionCore uses its own typed credentials and one secure item `{version,installationCapability,session}` under a sandbox-specific key/service with THIS_DEVICE_ONLY accessibility. Session is either a strict sandbox credential object or null when authority is retired but explicit capability resume remains possible. Strict parsing rejects private session wire, mixed prefixes, unsupported version, extra fields and oversized/corrupt data. The capability never enters AsyncStorage, navigation params, component state, clipboard, logs or feedback. One atomic secure-store write avoids a torn capability/session pair.

Initialization reads the secure item and explicitly resumes its capability once through the new sandbox endpoint to obtain fresh current credentials; it does not reuse a stale access token or run private verification. With no item, show entry without automatically creating an owner. Unknown/corrupt/failed secure storage means no usable process authority and clear storage-error UI; never fall back to an unverified in-memory credential.

Bootstrap is an explicit button action with locale and fresh UUIDv4 key. Persist the one-time returned capability+session atomically before phase active; failure leaves no usable process authority, no request retry and no fabricated recovery. Resume retains the already-held capability and persists its new session only after validated known success. Serialize all actions; generation/AbortController fencing retires stale or post-logout completions before storage or UI updates.

Run business work only while active. A sent unknown mutation, transport/decode error, authorization expiry or failed durable readback retires the session without automatically retrying; keep a still-valid capability in secure storage for a separate explicit resume action. Never replay create/edit intent automatically or continue showing cached private rows while inactive. Known closed conflict responses can remain typed data only when fresh owner readback occurs inside the same serialized callback; a readback failure retires authority. Refresh uses distinct sandbox header/prefix and atomic replacement, checks same session ID/new refresh secret, and never retries uncertainty; explicit resume is the adopted recovery. Entry labels distinguish unavailable, storage failure, resume and new workspace.

Logout synchronously retires live process authority and invalidates outstanding operations, then clears the entire sandbox secure item and asks the server to revoke capability and all sessions using the captured current access credential. A failed local clear must not prevent the best-effort captured server revocation; keep storage-error and no usable process authority. Return acknowledged logout only when strict204 succeeds and local clearing succeeds; unknown result clears local material without promising server revocation. Storage-clear failure blocks further use, not a false logout success. Known logout/new workspace never resumes the previous capability. No cross-device recovery, automatic reset/deletion or silent new bootstrap on failed resume.

## Strict five-route transport

Import the new closed sandbox contract and existing canonical business response parsers. New fetch adapter uses only the five sandbox routes, canonical configured sandbox HTTPS origin, omit browser credentials, error redirects, no-store and bounded10-second request lifecycle/131072-byte responses. Generate UUIDv4 keys through existing expo-crypto entropy with version/variant bits and validate entropy length/failure. Bootstrap/resume/refresh and manual/create-edit carry keys; logout/read/profile/mode/status obey the exact server header roster. Refresh is genuinely bodyless with no Content-Type. Reject non-no-store, unexpected media/status, private credential namespace, extra/invalid response fields, timeout and results resolving after abort. Generic exceptions expose no raw server/credential text.

Expose API/core constructor ports for deterministic source tests (fetch, secure store, entropy, clock, configured origin), with no caller owner injection. Production composition resolves the already-disabled sandbox runtime getter and therefore refuses networking until later reviewed activation. Tests injecting a candidate transport are tests, not a live endpoint claim. Build manifest variant identifies sandbox composition; a false runtime marker permits only unavailable entry UI, never hidden bootstrap requests.

## Router separation and readiness

At immutable build selection, sandbox root mounts SandboxSessionProvider and sandbox route wrappers; it does not mount NativeSessionProvider or EnrollmentProvider, initialize their storage or call private registration/BankID flows. Variant absent preserves the existing provider tree and routes. Sandbox index goes to its entry/Personal path. Add a sandbox route boundary to reject redirects/deep links to register/OTP/BankID/web/tabs/bank/detection routes and navigate to safe sandbox entry; merely omitting Stack.Screen declarations does not disable Expo Router's filesystem routes. No sandbox token can reach an existing private reader through a deep link. Invalid configured sandbox markers produce unavailable entry, never private/production fallback.

## Focused handoff checks and acceptance

Meaningful tests cover new wire/header/key/namespace framing; secure item atomicity/corruption/write/clear failures; initialization resume; generation/logout/abort races; known versus unknown mutation/readback and refresh recovery; coherent mounted entry/profile/Just Me/Add/Edit/status/Month/renewals/logout using the injected sandbox port; private default screen behavior preservation; blocked unsupported deep links; bilingual key parity and canonical Money projection reuse. Reserve the shared heavy slot for focused Jest/types/lint; no unchanged full-suite repetition. Independent source review precedes composition activation. Final activation still waits backend/ingress/TLS qualification and actual install/readback; mounted source tests do not establish working installed apps.

This is a coherent client implementation stream, not a standalone proof-only ticket. The next author can begin separate API/storage/core and dependency-port source as soon as exact ownership is frozen, while backend progresses. Keep the reviewed runtime false until the complete executable composition is ready for its deployment/native acceptance gates.
