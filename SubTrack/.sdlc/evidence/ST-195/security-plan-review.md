# ST195 Security Plan Review

**Disposition: APPROVE with mandatory conditions — Type 2a.** The proposed development-only mobile `GET /v2/me/sessions` adapter is additive to the accepted OpenAPI operation and ADR-0010 model. Its mobile Bearer branch remains isolated from browser cookie/CSRF semantics and v1. This approval is conditional on the hard gate: do not author or claim readiness until ST-194 is accepted with its required main/tree/CI evidence.

The boundary is sound if implemented as proposed: require the single canonical `Authorization: Bearer` v2 access JWT over the existing direct TLS socket; reject any Cookie header, Origin/nonce/CSRF alias, query, body, ambiguous framing, duplicate/raw-header ambiguity, and all HTTP/forwarded-transport fallback. Keep the adapter explicitly registered only for enabled development configuration and leave default application routing at 404. Do not add a mobile mode, identity selector, v1 fallback, new crypto/token namespace, or production/client-readiness claim.

Mandatory security conditions:

- Use the shared real principal resolver and independently trusted token-verification/claims port. After the resolver await, revalidate current JWT expiry with trusted non-regressing time and require verified `sub`/`sid` to equal the resolved identity/session. Do not authorize from decoded or caller-supplied claims.
- Then synchronously list only sessions owned by that resolved identity, while rechecking that the caller session is still active, live, and owned. No await may separate that check from listing/publication; deletion or expiry during resolution must fail closed.
- Require strict own-data snapshots at every port boundary; reject accessors, extra/symbol fields, exotic promises, malformed/duplicate IDs, invalid dates, and inconsistent current-session flags. Return only canonical owner-only summaries, with exactly one current row matching the resolved session. Use generic no-store errors and never log credentials.
- Keep OpenAPI's existing mobile Bearer operation semantics exact; no cookies, `Set-Cookie`, CSRF behavior, or browser branch leakage. Tests must cover real resolver/verifier/repository paths, sibling versus foreign ownership, expiry/deletion during await, parser/TLS/default-404 behavior, getters, and malformed repository output.

This review approves only the plan, not source, runtime wiring, or Android/iOS readiness.
