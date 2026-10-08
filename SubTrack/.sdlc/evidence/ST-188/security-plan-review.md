# ST188 security/privacy plan review

**Decision: APPROVE — Type 2a contract alignment, not a Type 1 security-model change.**

The proposed correction closes a contract omission against the already accepted ADR-0010 model. It keeps the existing exact-origin, one-use browser nonce plus distinct HttpOnly binding-cookie requirement, separate session-bound CSRF after login, proof purpose/transport binding, and generic lost-response restart behavior. It does not broaden credential semantics or add runtime behavior. Scope remains contract-only; no runtime readiness claim is approved.

The current OpenAPI `createV2Session` operation lists `OriginForWeb` and `Idempotency-Key` but omits `BrowserNonce`; `WebSessionHeaders` requires only idempotency key and origin. This differs from the proposed browser session redemption requirements. Existing nonce implementation supports purpose `session`; `consumeAndRotate` validates the nonce and cookie pair against exact origin and purpose, consumes the old nonce, and returns trusted chain/origin context. The existing proof store login consumption compares transport, exact origin, and browser chain against stored proof binding. The session proof redemption must receive that trusted context from the same successful nonce transition; the binding cookie alone must never establish chain authority.

Required contract constraints for the correction:

- Make the public browser nonce header required on the web session envelope/operation, with a web-only conditional requirement. Preserve the mobile envelope with only its existing idempotency header and preserve v1 unchanged.
- Require the nonce, distinct binding cookie, and exact allowlisted Origin together. Bind successful redemption to the trusted same-chain proof context, including exact origin and web transport; reject missing, mismatched, expired, replayed, or cross-mode evidence generically. Do not add a cookie-only lookup seam or caller-asserted chain identifier.
- Consume the nonce on successful web login-proof redemption. The one-use session endpoint returns session cookies and the distinct session-bound CSRF token; it must not return `nextBrowserNonce` or rotate to another bootstrap nonce after success. Unsafe cookie calls then use exact Origin plus session-bound CSRF under ADR-0010.
- Treat a committed redemption with a lost response as unreplayable: generic `409 AUTH_RESTART_REQUIRED`, no credentials/proof/secrets. Recovery is fresh server-verified login and a fresh nonce chain. A known prior session remains manageable through owner-scoped listing/revocation; an unknown orphan expires normally.
- Keep idempotency bound to operation, transport, browser chain or verified principal, and request hash; retries cannot replay one-use proof or mint another session.
- Do not change security model, runtime routes, providers, storage/configuration, or deployment in this contract correction. Regenerate only via the pinned generator and retain contract validation gates.

The already accepted ADR-0010 explicitly establishes this browser nonce, cookie, exact-origin, CSRF, and lost-response model. The plan is therefore a Type 2a API contract correction within that model. Any change to those trust relationships, proof binding, or recovery semantics would be Type 1 and requires founder decision under DECISION_RULES.

Review basis: `/workspace/.setup/ST188-plan.md`; repository `AGENTS.md`; `docs/governance/CONSTITUTION.md`; `docs/governance/DECISION_RULES.md`; `docs/architecture/adr/ADR-0010.md`; `packages/contracts/openapi.yaml`; and `apps/api/src/auth/browser-nonce/` plus proof-store login binding interfaces.

**Actual tool-call count: 5** (four `functions.exec` invocations for discovery/read and this artifact write; no code, Git, or metadata operations).


## Amendment: terminal consume-only session transition

**Decision remains APPROVE.** I agree with the platform requirement: successful web session redemption consumes the submitted session-purpose nonce terminally and issues no successor browser nonce. The session response instead establishes the separate session-bound CSRF token for subsequent unsafe cookie calls. This is consistent with ADR-0010 and the plan’s stated no-next-nonce semantics.

The existing `BrowserNonceGuard` exposes `consumeAndRotate`, which atomically replaces the nonce while retaining the chain, but does not expose a consume-only operation. ST188 must not specify that this operation is wired into session redemption, nor accept rotate-and-discard as equivalent runtime behavior. Implementing consume-only semantics belongs to a separate future runtime task and review gate. ST188 remains contract/ADR alignment only: define the expected terminal transition, trusted same-chain proof binding, and CSRF-after-login contract without claiming runtime support or readiness.

**Call count accounting:** original review count remains 5; this amendment adds 1 tool call (total 6).
