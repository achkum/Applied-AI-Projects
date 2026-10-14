# ST250 persistent first-beta backend contract

2026-10-14. Founder selected identity proposal A, as communicated by the conductor: adopt the separate simulated per-installation workspace and possession model. This contract freezes the narrow backend stream for independent privacy review and task-path amendment. **PLATFORM PLAN GO for this scope**, after inspection of actual accepted business source; not source/runtime/deployment sign-off. No code, SQL, Git, remote operation or heavy checks executed for this document. Production and existing private proof gates remain unchanged.

## First executable scope and exact paths

One persistent sandbox graph: guest entry/resume, current sessions, profile, Just Me, manual Add/Edit/status and owner pagination. Native Billing Month/renewals derive from the same persisted owner rows. No initial bank/detection/provider/household routes, fabricated BankID proof or automatic sample subscriptions. Empty fictional workspace is valid; tester enters fictional display name/manual subscriptions. This keeps first beta complete without unqualified detector/provider dependencies.

Freeze these source paths before author edits:
- `SubTrack/packages/contracts/openapi.yaml`
- `SubTrack/packages/contracts/sandbox-mobile.ts`
- `SubTrack/packages/contracts/tests/sandbox-mobile.test.mjs`
- `SubTrack/packages/contracts/package.json`
- `SubTrack/apps/api/src/sandbox/sandbox-config.ts` and `.spec.ts`
- `SubTrack/apps/api/src/sandbox/sandbox-token.ts` and `.spec.ts`
- `SubTrack/apps/api/src/sandbox/sandbox-authority.ts` and `.spec.ts`
- `SubTrack/apps/api/src/sandbox/sandbox-session.ts` and `.spec.ts`
- `SubTrack/apps/api/src/sandbox/sandbox-http.ts` and `.spec.ts`
- `SubTrack/apps/api/src/sandbox/main.ts`
- `SubTrack/apps/api/prisma/sandbox/001-sandbox-foundation.sql`
- `SubTrack/apps/api/prisma/sandbox/002-sandbox-mobile-business.sql`
- `SubTrack/apps/api/src/profile/private-mobile-business.ts` (only the authority parameter's structural type narrowing, described below)
- `SubTrack/apps/api/src/profile/private-mobile-business.spec.ts` (only preservation check if needed)
- `SubTrack/apps/api/package.json` (existing pg production pin already fixed; add only reviewed sandbox start/check scripts if required)

Generated OpenAPI client changes require conductor regeneration/curation through the existing contracts workflow; no handwritten generated client or unrelated path edits. Evidence remains ST250. Genuine PG integration qualification paths are frozen separately after authored source review; no disposable private fixture adaptation.

## Exact five public POST routes

Prefix `/v2/sandbox/mobile`; no aliases/private routes/default Nest registration. Contract-first OpenAPI definitions and strict pure module precede server source. Native only; no browser cookie/OTP transport.

| Route | Exact body | Credential/header | Known success |
| --- | --- | --- | --- |
| `/bootstrap` | `{transport:'sandbox-mobile',locale:'sv'|'en'}` | No Authorization; UUIDv4 Idempotency-Key |201 credentials plus one-time capability |
| `/resume` | `{transport:'sandbox-mobile'}` | `Authorization: SandboxCapability s250c.<43base64url>`; UUIDv4 Idempotency-Key |201 new session, never redisclose capability |
| `/refresh` | No body/content-type | `Authorization: SandboxRefresh s250r.<43base64url>`; UUIDv4 Idempotency-Key |200 rotated credentials |
| `/logout` | `{transport:'sandbox-mobile'}` | Sandbox access Bearer; no Idempotency-Key |204 after atomic workspace-wide revocation |
| `/business` | `{operation,body}` | Sandbox access Bearer; UUIDv4 Idempotency-Key only for manual/manual-edit | Existing business200/201 payload or typed problem |

Business operation enum exactly `profile-read`, `profile`, `mode-read`, `mode`, `owner-read`, `manual`, `manual-edit`, `status`. Dispatch body uses the existing strict parsers from profile/private-onboarding/private-mobile, including empty object for reads and existing bounded cursor. Reject unknown/accessor/prototype/symbol/extra fields before service; object owner/session/household fields are never accepted. The existing `id` edit/status field denotes an owned subscription, never a principal. Profile/mode/status do not acquire new automatic retry semantics. Do not add an unqualified health/auth shortcut or debug OTP route.

Credential response: exact `{transport:'sandbox-mobile',sessionId,accessToken,refreshToken,sessionExpiresAt}` plus `installationCapability` only on bootstrap. Session UUID server-generated; integer epoch-millisecond expiry. No owner ID in response. Distinct capability/refresh prefixes, exact43base64url32-byte randomness; access JWT <=4096bytes, Ed25519, fixed sandbox `kid`, `iss='urn:subtrack:auth:v2:sandbox'`, `aud='urn:subtrack:api:v2:sandbox'`, exact claims/type/version and15-minute TTL capped by durable session/capability. Reject production/private proof namespaces and wrong signing material. Strict problem codes contain no credential/resource/private input; credential/business responses `Cache-Control:no-store`. Bootstrap/resume duplicate or unknown outcome returns generic restart, never credential replay. Unknown write/refresh/logout outcomes are unavailable with no success projection.

## Immutable runtime tuple and transport

`SUBTRACK_RUNTIME=sandbox`, `NODE_ENV=production`, explicit startup enable, database `subtrack_sandbox`, login `subtrack_sandbox_api_login`, business role `subtrack_sandbox_runtime`, producer role `subtrack_sandbox_auth_producer`, epoch `st250-sandbox-v1`, fixed canonical public origin `https://198.44.116.159`. API refuses startup until qualified migration/catalog/checksum roster and current key manifest/epoch match. API login and roles are NOSUPERUSER/NOBYPASSRLS/NOINHERIT/NOCREATEDB/NOCREATEROLE with explicit SET ROLE grants only. Separate NOLOGIN schema owner; bootstrap/migration credential never in API. No `st233a_fixture_control`, proof database, Alice/Bob subjects or caller environment/DB/role selectors.

Private API ingress is only the reviewed isolated gateway hop. Before exposure, main must require bounded authenticated gateway provenance (separate server-side secret or equivalent verified transport); Docker network membership alone is not credential authority. Gateway strips incoming forwarding metadata and supplies its own source address/canonical host over this hop. No arbitrary forwarded address/header, external peer, reflected CORS or owner header is trusted. Dedicated public TLS is gateway custody; private app hop is not falsely claimed public TLS. Until that adapter is independently reviewed, startup/publication stay disabled as in prepared infrastructure.

Strict POST framing: canonical routes/host, no queries, duplicated/control/unknown headers or transfer encoding, exact supported media type/body shapes. Body max8192bytes, request deadline10seconds, global8 in-flight requests, actor pool4 (connection timeout3seconds), SQL statement timeout3seconds, lock timeout1second, transaction duration bound8seconds; failures discard uncertain connections. Response body max131072bytes. No request body/access token/capability/private field logging.

## Persistent auth and bounded admission

Foundation contains singleton epoch/key-manifest and capacity control, pseudonymous owner, installation capability digest, session/family/refresh digest and consumed refresh records, globally keyed admission reservations. Store only domain-separated HMAC/digests and server-generated IDs; HMAC key domains separate bootstrap/resume/refresh/capability/rates from signing. Owner is a real sandbox-only `public.identity` row with `auth_method='MOCK'` and no verifiedAt/email/phone/person name claim. Capability created30days fixed expiry; session24hours maximum capped by capability; access15minutes maximum capped by session. Wallclock/DB epoch fencing cannot move backwards or accept future authority.

Hard durable ceilings, including inaccessible/expired historical rows until a separately approved purge:100 total workspaces,50 subscriptions per owner,256 total create/edit receipts per owner,32 session rows per owner,3200 sessions globally,2048 admission reservations globally and3200 consumed-refresh records globally. No expiry cleanup masquerading as deletion policy; capacity exhaustion fails generic429 and pauses new admission. Every growth check and insert share a locked global capacity row plus owner lock in canonical order, enforced in database triggers/functions as well as caller flow. Transactions/receipts/body bounds limit retained input bytes; cap custom name120characters, category50, profile fields existing accepted bounds, and reject raw document/narrative uploads. First-beta schema has no raw bank transactions/feedback/blob tables. No paid autoscaling.

Bounded source-rate state: keyed source-address hashes only, maximum1024 RAM buckets with10-minute idle expiry; per-source bootstrap5/minute and20/hour, resume20/minute; global bootstrap20/minute and200/hour, resume100/minute; fail closed429 on bucket/concurrency capacity rather than evict hot buckets to bypass limits. Process restart does not reset durable workspace/session/reservation ceilings. Source address is never principal authority. Separate signing/capability/rate secrets and no raw identifier/capability telemetry.

Bootstrap burns a globally keyed one-use reservation in a known committed admission transaction before workspace creation. Reservation binds operation/transport/canonical request digest; same key under any mismatch or duplicate returns restart. Owner/capability/session creation then commits atomically; disclose raw capability/credentials only after known COMMIT plus clean connection verification. Unknown create COMMIT discloses nothing and creates no destructive compensation; a new key may create a new bounded workspace. Resume validates unrevoked digest/capability expiry and owner under locks, uses a new burned reservation and mints a new bounded session after known commit; no caller owner selector or raw capability storage. Do not replay credentials from reservation results.

Refresh locks global capacity then owner, capability and family/session in fixed order. Validate current unexpired capability, live session/family and token digest; rotate refresh once and record predecessor digest atomically. Reusing consumed refresh revokes that family, with known COMMIT required before acknowledgment. Uncertain rotation returns no credentials and client retires session without retry; still-current capability may explicitly resume a new session. No production fresh-BankID rule is changed. Logout locks the same current authority and atomically revokes capability plus every workspace session; data stays. Uncertain logout retires local material without promising acknowledged server revocation. Future bootstrap creates a different workspace after known logout.

## Reuse actual reviewed business source with new authority

Inspected `createPrivateMobileBusiness`: runtime use is exclusively `authority.withCurrentMobileAuthority`; there is no private-server instanceof dependency. Change its parameter annotation only to `Pick<DurablePrivateMobileAuthority,'withCurrentMobileAuthority'>`, preserving all current wire/business behavior and private callers. Sandbox authority implements that exact generic method and returns the same OwnerTx finite named `execute(name,values)` port. Do not widen the existing class config/constructor, proof tuple or runtime gates. No bank/detection statement registration.

Install immutable `PRIVATE_MOBILE_BUSINESS_STATEMENTS` only: accepted profile/mode/read/manual/create/edit/status SQL and existing canonical Money/lifecycle contracts. Each business transaction verifies sandbox JWT, resolves/locks its live owner/capability/session, sets BOTH transaction-local owner GUCs, confirms current epoch/manifest and executes only those fixed named SQL values. Current credentials and mode/profile restrictions precede all receipt replay. Lock owner/session authority throughout; final DB epoch/current-session recheck and synchronous token/time check complete immediately before COMMIT dispatch with no intervening await/callback/microtask window. Returning results requires known commit and reset/clean connection; unknown commit or failed rollback discards connection/results. Async caller guards cannot run after final guard.

Minimal second migration defines required `public.identity_profile`, `public.subscription` enums/table/revision trigger, `public.merchant` empty bounded lookup table (ownerList LEFT JOIN requires it), immutable `public.manual_subscription_create_receipt` and `public.manual_subscription_edit_receipt`. Copy compatible column/enum semantics, not private fixture/migration-control guards. No merchant seeding/provider authenticity. Identity/profile/subscription/receipt RLS all FORCE RLS with command-specific policies checking both owner GUCs; runtime no identity insert/owner reassignment, no DELETE, no receipt UPDATE, and only necessary subscription/profile column grants. Creation runs under bounded dedicated producer, not unrestricted application SQL. Receipt owner/subscription composite FK is preferred because no beta deletion path exists; receipt replay remains current-authority scoped and revision semantics remain accepted source behavior. Monotonic revision trigger alone increments on all subscription writes; caller cannot choose revision. Existing manual rows are MANUAL/SEK/alwaysPrivate true; no synthetic person verification claim.

## Author handoff and required proof

Implement strict contracts first, then standalone token/config/session/authority plus minimal qualified schema, then five-route server. Database capacity/privileges and100% Money/privacy branch requirements apply. Meaningful source tests cover closed wire/namespace, entropy failures/credential nonreplay, duration/expiry boundaries, current owner/session before replay, workspace logout, capacity races, final guard ordering and unknown COMMIT/ROLLBACK withholding. Actual persistent PG qualification must demonstrate two independent owners, ordinary-role GUC/RLS/grant/FK denial, restart/resume/readback, refresh reuse, expiry/logout, concurrency ceilings and unknown transport outcomes using real queries. No unit/fixture proof substitutes installed Android/iPhone acceptance. Runtime public exposure still waits independent source/deployment review, qualified TLS/ingress and actual device behavior; keep ready independent author streams moving while those gates resolve.
