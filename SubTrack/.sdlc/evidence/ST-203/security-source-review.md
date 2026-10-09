# ST-203 frozen source security review

**Disposition: APPROVE_SOURCE.** No source-level High, Critical, or other blocking security finding was identified in the reviewed frozen files. The independent security veto remains available if later QA or CI uncovers a security defect. This disposition accepts only the founder-approved, development-only adapter scope in ADR-0013; it does not approve production readiness, real OTP delivery, default registration, account deletion, or ST-198 authority changes.

## Frozen source identity

All four actual source files match the recorded `.sdlc/evidence/ST-203/source-freeze.json` SHA-256 values:

| Path | SHA-256 | Match |
|---|---|---|
| `apps/api/src/auth/proofs-v2/mobile-deletion-otp-verify-http.ts` | `9c025f722f9b771776c7d06eafac36bdfe414b4c0ac82d412b30a9b6c6872028` | Yes |
| `apps/api/src/auth/proofs-v2/mobile-deletion-otp-verify-http.module.ts` | `df2878b9748e9349f7d17c02fc3205cbea22146dd02ee1d1a3e600d5c240b3f5` | Yes |
| `apps/api/src/auth/proofs-v2/mobile-deletion-otp-verify-http.spec.ts` | `ca0413d249a60a55fd2111a52ef0e2a3be36dcbb7550298f35b50b0d36484f61` | Yes |
| `apps/api/test/mobile-deletion-otp-verify-http.spec.ts` | `41f7f8595d3648c051088d244b5ea0970badf9ce58d16f77f3a003fc3f8dad92` | Yes |

## Security findings

**Normalized source-review findings: 0 Critical, 0 High, 0 Medium, 0 Low; 0 blocking.**

The adapter enforces exact development/enabled/`authDeleteOtpDevOnly` gates and explicit module registration. It accepts a single Bearer token on direct TLS, rejects cookies and ambiguous/raw credential framing, selectors and query strings, and requires the strict JSON request shape. Parser and service responses set no-store/no-cache headers. Challenge ID and six-digit code are validated before quota, reservation, or core verification. The trusted authority comes from the existing current-principal/session/registered-contact resolver; no caller-supplied identity or contact is used.

The service bounds local throttling and reserves `verifyV2DeleteOtpReauth` under a verified-principal HMAC binding plus a request digest. It does not place code or proof in replayable reservation state. Duplicate or changed requests cannot replay a proof. Immediately before the one core invocation, it synchronously rechecks current token claims and the owned session without an intervening await. It requires a native promise, rechecks authority after proof issuance before settlement, then performs another synchronous current-authority recheck after settlement and immediately before disclosure. Core verification failures collapse to generic 403; duplicate outcomes use generic 409; other trusted failures stay generic. Error bodies do not expose challenge, attempt, contact, code, proof, or trusted-port details.

The accepted proof producer validates authority scope, consumes the challenge before awaiting proof issuance, and emits the existing account-delete-purpose proof. The adapter makes no cross-store transaction claim and does not retry, replay, roll back, restore, or guess cleanup after uncertain outcomes. Consequently, bounded consumed-challenge/proof orphans remain possible after issuance, revocation, settlement, or response failures; callers must restart with a fresh challenge. This is consistent with ADR-0013 and the plan reviews.

The registered route is opt-in and remains outside default application wiring. Review found no new authority kind, auth mode, provider, schema, contract, dependency, UI, or deletion behavior in the frozen scope.

## Adversarial coverage and verification limits

The focused unit and local-CA HTTPS specs use the accepted principal/session/contact resolver, idempotency guard, deletion OTP producer and proof store. Reviewed cases include exact proof response/purpose binding, generic verification failures, malformed and ambiguous requests, duplicate and parallel attempts, revocation during deferred contact/proof awaits, consumed challenge after proof insertion failure, non-replay after uncertain settlement/response outcomes, hostile body/core thenable behavior, and default-route absence.

The conductor reports 33 focused checks passing, with typecheck and lint passing; the full API suite was still running when this review was assigned. I did not run tests, builds, or mutate source. This review verifies frozen file identity and source/spec coverage, not the final full-API or CI result. Merge remains subject to those required gates and exact-head evidence.
