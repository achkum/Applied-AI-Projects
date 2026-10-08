# ST185 security design review

**Decision: APPROVE WITH IMPLEMENTATION CONDITIONS**

Reviewed the ST185 draft against the repository instructions, Constitution, accepted ADR-0010, ST-184 task contract, and available ST184 plan-review records. ST184 source acceptance is a hard gate: this review approves only the proposed internal development refresh-service contract after ST184 is accepted. It does not authorize source work before that gate, HTTP/runtime integration, a provider, durable storage, or a client-readiness claim.

## Security assessment

The service design preserves the refresh credential as the sole principal proof: it accepts no caller owner, session, or family selector; hashes the presented secret and delegates authentication to the accepted repository operation; and issues access credentials only for the canonical owner/session from an exact rotated outcome. A strict `v2r` plus 43-character unpadded base64url grammar with decode/re-encode equality rejects noncanonical final pad bits and malformed encodings before any dependency call. Generate a 32-byte successor from server randomness, encode it canonically, domain-separate both SHA-256 hashes with one documented fixed domain and byte encoding, and check that successor and current hashes differ before repository mutation. Only the response path holds plaintext secret material; persistence receives hashes only.

The prescribed dependency order is security-relevant and should remain explicit in implementation: validate the exact own-data config and request shapes, snapshot and freeze the mobile or canonical HTTPS web transport context, validate the incoming secret before calling dependencies, and capture only callable data descriptors while preserving receivers. Read the initial safe, nonnegative clock before requesting exactly 32 random bytes. Make one `rotateRefresh` call with the frozen transport snapshot and initial time. Do not perform owner lookup or any second mutation attempt. This prevents getters, mutable caller transport objects, and invalid input from triggering observable collaborators or burning a valid credential.

Only an exact own-data `{kind:'rotated', identityId, sessionId, familyId, expiresAt}` result with canonical, internally consistent identifiers and a safe fixed expiry may proceed. `invalid` and `reused` are exact generic failures. Unknown, malformed, accessor-bearing, extra-field, or throwing results are generic failures without credentials; if mutation status is uncertain, treat it as an unknown orphan that expires under ADR-0010 rather than claiming rollback or retry safety. A rotated result establishes a bounded cleanup tuple from stored canonical values, never caller data.

Clock checks must bracket both the awaited rotation and synchronous token signing: require safe nonnegative integer timestamps, no rollback, and a fresh time strictly before the stored expiry. Validate the issuer result as a bounded string before constructing the frozen minimal response `{sessionId, accessToken, newRefreshToken}`. If any failure occurs after a validated rotated outcome, attempt exactly one owner-context `revokeRotatedFamily` call using the exact stored owner/session/family/successor-hash tuple; tolerate cleanup false/throw by still returning no credentials. Never restore the consumed refresh token. A concurrent reuse can revoke after this service's commit point, so returned success does not assert the credentials remain current; the shared resolver remains authoritative on every later request.

Tests should prove this contract through the same accepted issuer, refresher, repository and resolver for mobile and web, including replay revoking both old and current access JWTs while preserving adjacent families and owners. Exercise canonical pad bits, malformed/exotic own-data inputs, dependency getter avoidance and receiver capture, hash collisions/no-burn, fixed expiry, deferred clock rollback/expiry, issuer faults and exact-family cleanup, and unknown/throwing adapter outcomes with no credentials. Keep raw secrets out of repository state, logs, and failure assertions; use ephemeral signing keys. The bounded-orphan case must remain described as an ADR-0010 limitation, not a durable consistency guarantee.

## Conditions

1. Do not begin ST185 source until ST184 is formally accepted; the available review records do not establish source acceptance.
2. Fix and document the hash domain/encoding in the implementation contract so hashing is deterministic and scoped specifically to v2 refresh secrets.
3. Preserve strict canonical parsing and exact own-data checks before collaborators; preserve transport snapshot isolation and receiver-safe method capture.
4. Keep exactly one rotation attempt and ensure all credential-bearing values remain local until the post-rotation clock and issuer checks pass.
5. On known post-rotation failures, attempt only exact tuple-scoped family cleanup; on unknown outcome, fail closed with no credentials and no retry or rollback claim.
6. Keep this internal development service isolated from HTTP, CSRF, idempotency, providers, database adapters, and client/product authentication claims. Any durable adapter or broader integration requires its own contract and review.

## Limits

This is a design review of the draft, not an implementation or test review. It does not verify source behavior, accepted ST184 state, CI/QA, HTTP or transport production, durable concurrency, deployment, or production security. ADR-0010 is contract-only. ST185 must not change that scope.

## Review accounting

Tool calls used: **4 total**. The first three were batched repository/document discovery and reads; the fourth wrote this review artifact. No source files, tests, QA, Git state, environment configuration, or subagents were touched.
