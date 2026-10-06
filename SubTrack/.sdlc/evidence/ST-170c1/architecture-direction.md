# ST-170c architecture review: browser nonce guard

## Decision

Proceed with a small internal authentication slice in `apps/api/src/auth/browser-nonce/`: a configured nonce service plus an atomic in-memory store for local/test use. Keep HTTP routes, cookie serialization, global CORS policy, schema changes, durable storage, and client wiring out of this slice. This gives later handlers a verifiable guard result while respecting ADR-0010's contract-only boundary and ST-170b's explicit separation of nonce/HTTP integration.

The service must verify the security evidence itself. Do not accept a caller-provided `verified`, `chainId`, `originAllowed`, or prehashed binding as proof. Give it the received exact Origin, public nonce header, raw binding-cookie value, and the transport's HTTPS/local-development facts. Only after validation and atomic consumption should it issue an internal trusted browser-chain context suitable for OTP proof binding. This is an internal API boundary, not a public schema promise.

## State and operations

Generate independent high-entropy random values for the public nonce, HttpOnly cookie secret, and opaque chain ID. Send the nonce in the JSON response and the cookie through a future HTTP adapter. Persist only SHA-256 domain-separated hashes of the nonce and cookie secret, with purpose, exact canonical origin, chain ID, expiry, and consumed state. Never store or log raw credentials. The cookie is a binding secret, not the nonce.

The smallest useful service surface is:

1. `issue(purpose, requestEvidence)` validates an allowlisted exact origin and scheme, invalidates the previous active chain for that same binding cookie (if one is present), then returns a public nonce, cookie secret, opaque chain ID and expiry for the future controller to serialize.
2. `consumeAndRotate(purpose, requestEvidence, nonce, cookieSecret)` validates origin, scheme, purpose, expiry, and both hashes, then atomically marks the supplied nonce consumed and issues the next nonce under the same chain and binding. It returns only the next public nonce and a server-created trusted context containing the opaque chain ID and verified origin/purpose. All failures have one generic rejection surface; no state or secret is disclosed.

A nonce cannot be retried after failed downstream work or a lost response. Recovery starts a fresh chain with a fresh idempotency key, as the OpenAPI contract requires. Atomicity must cover consume plus rotate; no `await` may split those state transitions in the in-memory reference implementation. Keep the store interface narrow so a future durable adapter can provide the same atomic operation, while making no production-persistence claim.

## Origin, transport, and cookie rules

At service construction, require a nonempty configured exact-origin allowlist. Parse each entry as an origin and reject entries with a path other than `/`, query, fragment, userinfo, wildcard, `null`, opaque origin, or non-origin serialization. Request Origin must match a configured canonical origin exactly; never derive an allowed origin from Host, forwarded headers, or the request itself. Permit HTTP only for explicitly enabled loopback local development; require HTTPS otherwise. Fail closed when configuration is absent or invalid.

A later controller should set only a host-only cookie with deployment-configured name and Path, `HttpOnly`, `SameSite=Lax`, and `Secure` outside loopback HTTP development; it must omit `Domain`. Cookie name/path and the production host need deployment configuration, not guessed constants in this core. Emit `Cache-Control: no-store` and `Pragma: no-cache`; never enable credentialed CORS by reflecting arbitrary origins.

## Relationship to the accepted v2 contract

- `/v2/auth/browser-nonce` has required Idempotency-Key and exact Origin; request purpose is one of `enroll_identifier`, `otp_step_up`, or `session`; response exposes only the public nonce. Cookie is separate.
- Browser OTP start and verify must call `consumeAndRotate` before proceeding and bind resulting proof to the verified chain ID and origin. Mobile calls do not use this service.
- Browser nonce is not session CSRF. Later unsafe cookie-authenticated session calls use the separate session-bound `X-Session-CSRF` contract. Never reuse either token for the other purpose.
- Keep `/v1` unchanged. Do not change `packages/contracts/openapi.yaml` or generated contract files as part of this runtime-core slice.
- This does not establish a server-verified BankID/login-proof producer or make session exchange client-ready; ST-170b's remaining integration gates remain.

## Minimal implementation and review checks

Expected source scope: `apps/api/src/auth/browser-nonce/**` plus the auth module registration in `apps/api/src/auth/auth.module.ts` if needed. Add focused tests beside the service/store. No controller or provider wiring is needed here. Proposed call volume is two service calls per browser flow step (issue once for bootstrap; consume-and-rotate once per protected step), with no extra client round trip beyond the documented contract.

Tests should cover: exact configured origin acceptance and rejection (including `null`, wildcard, suffix/prefix lookalikes, path-bearing config, missing Origin); HTTPS enforcement and the explicitly configured loopback exception; public nonce and cookie secret are distinct; wrong cookie, nonce, purpose, origin, and expired nonce all fail generically; successful one-use consume and same-chain rotation; replay and concurrent consume yield exactly one winner; new bootstrap invalidates the prior chain for that browser binding; and stored records contain hashes only. These are meaningful security behavior tests, not broad auth/provider tests.

Do not claim production readiness: in-memory state is process-local and disappears on restart, so multi-instance use and durable atomicity need a separately reviewed persistence task. Do not add BankID fields, provider behavior, CSRF implementation, DB schema, deployment-origin guesses, or public HTTP endpoints in this slice.

## Evidence reviewed

- `docs/governance/CONSTITUTION.md`: contracts-first, test new behavior, preserve scope and privacy.
- `docs/architecture/adr/ADR-0010.md`: accepted opt-in v2 contract; exact origins, paired one-use nonce/cookie, distinct session CSRF; no runtime/provider/schema/deployment approval in the ADR itself.
- `packages/contracts/openapi.yaml`: `/v2/auth/browser-nonce`, `BrowserNonceRequest` / `BrowserNonceResponse`, `ExactOrigin`, `BrowserNonce`, and OTP nonce rotation requirements.
- `.sdlc/tasks/ST-170b.md`: HTTP/transport/nonce/session-CSRF integration remains a separately reviewed slice; in-memory reference state is not production persistence.
- Existing auth modules under `apps/api/src/auth/`: Nest modules register auth features; OTP currently uses Prisma and the v2 proof producer/store are separate. Keep the nonce core independent of legacy OTP persistence and provider code.

## Conductor scope clarifications
Accepted binding cookie remains Secure in the future adapter, including local development; this slice does not serialize cookies. Do not register an auth module or add endpoints. One bootstrap call then one consume/rotate per protected operation (not two calls per step). The service owns independent secrets and opaque server chain ID; no client-visible chain field is added to the OpenAPI response. Purpose enum matches existing accepted contract. Origin allowlist and actual secure-transport facts are supplied by trusted server configuration/adapter, never reflected from request headers. No forwarded-header trust policy is implemented here.
