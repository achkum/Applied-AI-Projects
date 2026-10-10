# ST-223 independent security/privacy plan readiness

```yaml
contract: REVIEW/v1
task_id: ST-223
reviewer: security-privacy
verdict: APPROVE
summary: >
  Approve the frozen Type 2a contract-only plan for additive, unavailable-default
  v2 browser status PATCH. This is plan readiness, not source, runtime, QA, or
  release approval. No High or Critical plan finding.
findings: []
```

Review basis: `.sdlc/evidence/ST-223/contract-plan.md` Git blob `f203c4e0762476b8137c8b4c16d7521b5dc8c2b2`, ST-223 task, accepted ADR-0010/0023/0024, proposed ADR-0025 and ST-218 readiness, actual V1 PATCH and V2 browser-read OpenAPI, and ST-220's accepted private read adapter/security review. Current checkout is `1bfe451eac89dcdbec56691a09faf0c075d09611`; ST-222 browser proof remains separately pending.

The plan preserves isolated v2 cookie authority. A later adapter must reject raw duplicate or mixed credential/header input before parsing can collapse it; require direct TLS and one exact allowlisted Origin; reject `Authorization`, `st_v2_refresh`, caller identity/scope selectors, unknown body fields and every query parameter. Verify the access token for `sid/sub`, hash the *observed* binding cookie, use `webContextForCurrentSession` for the trusted chain, pass that chain to `DevelopmentV2PrincipalResolver.resolve`, compare owner/session, and verify session-bound CSRF before constructing the server-only `RequestContext`. Because resolver work is asynchronous, the later runtime review must also confirm a fresh current-session and web-binding recheck before the owner write, as the accepted ST-220 read adapter does. No v1 fallback or token conversion is authorized.

The only authorized mutation is the accepted seven locked-current owner transitions through the private writer under transaction-local ordinary-role PostgreSQL RLS. Same-status and other disallowed pairs return 409; missing and foreign IDs have identical 404 bodies. A lost PATCH response requires authoritative re-read, with no automatic write retry, replay receipt, or mutating-POST idempotency reservation. The contract should reject `Idempotency-Key` rather than imply a guarantee for this PATCH.

For source review, give v2 PATCH its own strict four-field problem schema including 403 `AUTH_CSRF_UNAVAILABLE`, while leaving V1 lifecycle and V2 read schemas, operations, security and errors unchanged. Require `Cache-Control: no-store` on success and every problem response; 400/401/403/404/409/500 must map to the plan's exact bounded codes without owner, credential, query or storage details. Contract tests should inspect the actual route, security, headers, strict status-only request, response/error references, seven-pair prose, generated parity and unchanged V1/read boundaries.

This approval authorizes root GO-AHEAD for contract/generated/test work within ST-223 paths. A later adapter needs a separate exact-source security review and direct HTTPS browser plus owned disposable ordinary-role PG proof, including revocation or rebind during async resolution, foreign isolation, races, rollback and pooled RLS cleanup. Contract completion alone does not establish route activation, persistent account/session, onboarding, ST-217 UI, ST-081 completion or public release readiness.

## Revised plan readiness — frozen blob `07cf0e20d541bf73c562bae18622b4bfc9abf143`

**Verdict: APPROVE Type 2a contract-only plan readiness; no High or Critical finding.** This supersedes the earlier frozen-plan basis `f203c4e0762476b8137c8b4c16d7521b5dc8c2b2` for GO-AHEAD while preserving its review history. The revised 12-line plan incorporates the prior review's `Idempotency-Key` rejection and post-async current-session, binding and chain recheck before the locked writer.

The revised 409/uncertain-response path is security-sound: perform an authenticated authoritative V2 read POST, never use V1 credentials or automatically repeat PATCH; if re-read fails, clear the private view and disable lifecycle actions. These are future client/runtime requirements, not proof that a route or user flow is active. Source review must still verify a distinct strict v2 PATCH problem schema with CSRF 403, `no-store` on every outcome, unchanged V1/read boundaries, and generated/contract-test parity. Later exact-source security, owned ordinary-role PG, real HTTPS browser, QA and applicable CI gates remain blocking.

## Independent exact-source review — implementation manifest `c2f543e` / `f2a6f91` / `b5be670`

```yaml
contract: REVIEW/v1
task_id: ST-223
reviewer: security-privacy
verdict: REQUEST_CHANGES
summary: >
  The additive unavailable-default route preserves the browser authority and
  owner-only locked transition prose, with a separate strict v2 problem schema.
  One contract gap leaves the privacy cache guarantee optional in OpenAPI.
findings:
  - severity: Medium
    path: packages/contracts/openapi.yaml
    location: PATCH /v2/subscriptions/{id} 200 and BrowserSubscriptionLifecycleProblem
    issue: >
      Both Cache-Control response headers constrain their value to no-store but
      omit required: true. OpenAPI therefore still accepts a success or problem
      response with no Cache-Control header, contrary to ST-223 acceptance 3.
    fix: >
      Add required: true to both header objects and assert it for 200 and every
      referenced problem outcome in the route contract test; regenerate as needed.
```

Basis: all seven `git hash-object` results match the normalized manifest in `implementation-handoff.md`: OpenAPI `c2f543e745a5f3d76eebd45a5989aa1d14afc63b`, existing contract test `f2a6f91778f2f895e59f4c71023e1afe01d343be`, new lifecycle test `b5be670f1cbfa6ed0c126885616f4940c7c1ecda`, and generated index/SDK/types/Zod `401f45ceae6614475c41c80d5c33e5de941162d0`, `b1323dc5e9aed927f1c83ebee0942e76f87fa4a3`, `a3e13f174576273c242d80dd76bf058d67514f4e`, `9238161ed49604b198ff5dd79587ad36da01a810`. Diff inspection shows no V1 PATCH or V2 read edit. The new path has UUID id, cookie-only declared security, exact Origin and CSRF headers, no query parameters, strict reused status-only body and `{id,status}` result, six explicit problem statuses including a separate 403 code, and unavailable-default availability. Its prose covers raw duplicate/mixed authority rejection, direct HTTPS, access `sid/sub`, observed binding hash, current-session/principal chain, post-async recheck, CSRF before server-only context, locked ordinary-role RLS writer, all seven allowed pairs, identical owner-private 404, authenticated re-read after conflict or uncertainty, and no PATCH retry/idempotency/nonce mutation. These are contract promises; no runtime route or browser/PG proof is present in this source slice.

The `BrowserSubscriptionLifecycleError` four-field schema is strict; its independent status and code enums rely on the response prose for pair mapping. The generated SDK/types/Zod reflect the declared route, and the new test checks strict body/result/problem shapes and unchanged neighboring security/status boundaries. Once the cache header requirement and assertion are corrected, an independent re-review should freeze a new seven-blob manifest. This review does not approve route activation or downstream release gates.

## Independent source re-review — repaired cache header manifest

```yaml
contract: REVIEW/v1
task_id: ST-223
reviewer: security-privacy
verdict: APPROVE
summary: >
  The sole Medium source finding is resolved. The additive unavailable-default
  v2 browser PATCH contract now requires no-store on success and every bounded
  problem response. No remaining High or Critical source finding.
findings: []
```

This verdict supersedes only the preceding source `REQUEST_CHANGES` verdict; the plan reviews and finding history remain above. Exact normalized Git blobs verified: OpenAPI `71f2b27c55cd110678fbe18f8e3abc8779dbf776`, browser lifecycle test `61fde74fa466305cce5b1a52fe2f93672efc42e5`, existing contract test `f2a6f91778f2f895e59f4c71023e1afe01d343be`, and generated index/SDK/types/Zod `401f45ceae6614475c41c80d5c33e5de941162d0`, `b1323dc5e9aed927f1c83ebee0942e76f87fa4a3`, `a3e13f174576273c242d80dd76bf058d67514f4e`, `9238161ed49604b198ff5dd79587ad36da01a810`. The five unaffected blobs match the prior manifest.

The `200` response and shared `BrowserSubscriptionLifecycleProblem` now each declare `Cache-Control` as `required: true` with `const: no-store`. The route test checks the `200` header and dereferences each 400/401/403/404/409/500 problem response to check the same requirement. Diff inspection confirms the route remains cookie-only and `unavailable-default`, with no edits to the V1 PATCH or V2 read contracts. The earlier review's browser authority, strict status-only request/result/problem, CSRF 403, seven owner transitions, owner-private 404, authenticated conflict re-read and no-retry/no-idempotency observations still apply. Author-reported package tests, generation, lint, typecheck and diff check passed in the handoff; this independent re-review verified source and normalized blobs, not a fresh runtime/browser/ordinary-role PostgreSQL proof. Those later gates remain blocking for route activation and release.
