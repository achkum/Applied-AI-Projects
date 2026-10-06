# ST170 platform review — candidate v2

**Verdict: APPROVE_PROPOSAL**
**Ratings:** version/wire direction 5/5; principal rules 5/5; repository boundary 5/5; onboarding coverage 5/5; route completeness 5/5.

This review approves the proposal for contract reconciliation and OpenAPI work. It does not authorize implementation, deployment, migration, provider changes, or rollout. The candidate remains opt-in `/v2`, preserves `/v1`, and makes no rollout-safety claim.

Candidate v2 resolves the four remaining findings from the prior review:

- Web session creation returns `{sessionId, csrfToken}`, while refresh also returns the rotated session CSRF token; the token is distinct from the pre-auth browser nonce and supports authenticated unsafe cookie calls.
- Access and refresh cookies have explicit names and path/security attributes, with no invalid `__Host-` prefix on narrower paths.
- BankID/login and production deletion proof production is explicitly assigned to separately required ST170b adapter integration. Provider payloads and client-asserted results remain outside the contract; session exchange is not client-ready until that gate passes.
- Development OTP deletion has authenticated same-principal/session start and verify routes. The DELETE operation requires current same-principal authentication, exact Origin and session CSRF for web, plus an independent deletion-only proof consumed atomically.

The proposal preserves UF-01's identifier → OTP → mandatory BankID registration sequence and prevents OTP alone from creating/selecting an identity or establishing a login. Refresh transport and rotation invariants, nonce binding, owner-scoped session operations, and `/v1` isolation are also sufficiently specified at proposal level.

**Remaining required corrections: 0.** The explicit ST170b integration and the listed security/privacy, deployment, storage-inventory, and RLS evidence gates remain prerequisites to implementation or rollout; they are not proposal defects and are not approved by this review.
