# ST189 security/privacy plan review

**Decision: APPROVE — Type 2 internal security alignment within ADR-0010.**

The proposed consume-only session transition is consistent with ADR-0010 and the accepted ST-188 terminal-consumption contract. It closes a missing internal runtime primitive; it does not change the trust model, establish session exchange, or claim an atomic nonce-plus-proof-plus-session transaction. The current guard has only `consumeAndRotate` and non-mutating `validateBound`, so a dedicated atomic consume operation is needed for future session redemption.

The plan has the right boundaries: fixed `session` purpose, exact accepted origin and HTTPS/explicit-loopback evidence, format-checked nonce and cookie, safe clock and existing five-minute TTL, and a trusted store result that is validated before returning frozen chain/origin/purpose context. `consumeSession` must synchronously compare the nonce hash, cookie hash, exact origin, purpose, and validity window, then remove only that row and create no successor. It must not emulate atomicity as peek followed by delete. An optional store port is acceptable to preserve old adapters; if absent, the guard must fail closed without falling back to peek or rotation. A valid competing terminal consume and rotation must have one winner. Failed validation or mismatch must preserve the live row. The result exposes no raw secret, hash, expiry, or caller-selected purpose/chain. If the adapter outcome is uncertain or malformed, return generic failure and never restore or retry the nonce.

The tests listed in the plan cover the important guarantees: terminal consumption and empty snapshot, replay and preflight/rotation failure after consumption, purpose separation, mismatch preservation, unsafe/backdated/expired time, terminal-consume races against terminal consume and rotation, and isolation of other rows/chains, while preserving existing rotation and HTTP behavior. No expanded TTL or capacity policy is needed.

This primitive only establishes the nonce transition and trusted browser context. It does not make proof consumption and session persistence atomic with nonce consumption; future orchestration must separately review commit ordering, failure handling, and idempotency.

For sequencing, source work may proceed on its own dependent branch while ST-188 CI runs because the source scope is disjoint. The hard merge gate remains the accepted ST-188 tree proof and exact-head CI, plus this task’s required QA and platform/security approvals. Any ST-188 changes that alter the contract must be reconciled before merge.

Review basis: the ST189 proposal, repository instructions, Constitution, Decision Rules, ADR-0010, current browser nonce implementation, ST-188 task contract, and ST-188 security review.

**Actual tool-call count: 2** (one batched read and this artifact write; no source, Git, or metadata operations).
