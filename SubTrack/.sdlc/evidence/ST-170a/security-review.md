# ST-170a security/privacy actual-contract review

**Verdict: APPROVE**  
**Scope:** Contract-only review of the revised OpenAPI, API contract addendum, task, prior review, and ADR-0010. This does not certify runtime enforcement, deployment, provider behavior, or rollout safety.  
**Review effort:** 4 tool wrappers / 4 shell-command calls total, including the narrow residual re-review. No tests, builds, discovery, or Git mutations were run.

## Residual finding resolved

The residual wording issue is resolved: `MobileRefreshResponse.accessToken` is now described as a short-lived v2 access JWT rotated within the same session family, consistent with `MobileSessionResponse`, the bearer scheme, and the API addendum. No behavioral or security-model concern remains from this review.

## Re-review of prior findings and requested controls

- **Lost one-use responses: addressed at contract level.** The OpenAPI and addendum prescribe generic `409 AUTH_RESTART_REQUIRED` with no credential replay, then a fresh nonce chain or OTP challenge under existing throttles. Uncertain session creation requires fresh verified login; after login, only a known prior public session ID can be handled through owner-scoped listing/revocation, while unknown orphan sessions expire. Uncertain refresh explicitly forbids retrying the old token and directs fresh verified login.
- **Idempotency binding/pending behavior: adequately stated in the addendum and ADR.** Keys bind to operation, transport, browser chain or verified principal, and request hash. Duplicate pending or committed requests return generic 409 without acknowledging another caller, revealing a result, replaying secrets, or bypassing throttles/one-use consumption. The seven mutating POST operations expose 409 V2Problem responses.
- **Nonce caching: addressed.** Browser nonce success documents `Cache-Control: no-store` and `Pragma: no-cache`; the addendum repeats both.
- **Proof TTL and browser controls: addressed.** Proofs have a five-minute TTL. Exact Origin, separate HttpOnly binding cookie/public nonce, nonce rotation, distinct session CSRF, and same-principal development deletion controls remain specified; deletion stays behind the explicit development gate and production recent BankID requirement.
- **Problem schema and v1 boundary: preserved in the reviewed text.** V2 adds `V2Problem` with stable `code` and no-store headers; legacy `Problem` remains separate and v1 routes continue to reference it. The reviewed contract/ADR state additive v2 and preserved v1 behavior. This textual review does not establish byte-for-byte or runtime compatibility.

This contract-only review approves the reviewed security/privacy wording. It does not imply runtime, provider, deployment, or rollout approval.
