# ST189 platform plan review

**Decision: APPROVE — Type 2 internal architecture seam.** The proposed terminal session-nonce consume operation fits ADR-0010 and ST188’s accepted contract: successful web redemption consumes the existing session-purpose nonce and returns no successor. It does not add a public contract, change purpose boundaries, or claim to implement a complete session exchange.

The guard should expose a fixed-purpose `consumeForSession(evidence, nonce, cookieSecret)` operation. Purpose must be `session` internally; callers must not choose a purpose or supply a trusted chain. It should reuse the current exact allowlisted canonical-origin and HTTPS checks (including only the configured explicit loopback development exception), 43-character nonce/cookie validation, safe-integer clock, and five-minute TTL rules. Preserve the stored chain ID, exact origin, and `session` purpose in a frozen `TrustedBrowserContext`. Return no raw nonce, cookie secret, hashes, or expiry, and log no secrets.

The store transition must compare the nonce hash, cookie hash, exact origin, stored session purpose, issue/expiry bounds, and exact TTL, then atomically delete only that matching row and return its stored context. Add an optional `consumeSession` store port so existing adapters remain source-compatible; when it is absent, fail closed. Do not emulate consumption with `peek` followed by delete or with `consumeAndRotate` followed by discarding the successor. Malformed or mismatched input must leave a live row intact. If a store reports an invalid/malformed outcome after an uncertain commit, return the generic failure and do not restore or retry the nonce. The trusted adapter owns the atomic compare-and-delete guarantee; the guard validates the returned context against the expected session purpose, origin, and trusted record shape.

This primitive guarantees atomicity for nonce consumption only. It does not make proof verification, session creation, response delivery, or nonce consumption one transaction. Any future session-exchange orchestration must separately review commit ordering, failure recovery, idempotency, and proof/session atomicity.

Tests should cover the frozen exact context and empty snapshot after success; replay and preflight/rotation failure on the consumed row; refusal of same-chain OTP-purpose records; mismatch preservation; clock, backdating, and expiry boundaries; terminal-consume races against terminal-consume and rotation with one winner; and preservation of unrelated rows. Existing OTP rotation and HTTP behavior should remain intact.

**ST188 gate:** ST189 may develop on its disjoint source branch while ST188 exact-head CI runs, but the workflow amendment is a hard merge gate: ST189 cannot merge until the accepted ST188 tree proof and ST188 exact-head CI are complete, in addition to ST189’s independent QA, platform/security approvals, and exact-head CI. Reconcile against ST188 if its accepted tree changes.

The plan is consistent with the supplied ST188 platform review at `.sdlc/evidence/ST-188/platform-plan-review.md`, the task’s contract-only/runtime-readiness boundary, ADR-0010’s terminal-consumption rule, and the repository Type 2 architecture decision rules.

Tool calls used: 4 (three batched/read calls and one review artifact write; no Git or metadata operations).
