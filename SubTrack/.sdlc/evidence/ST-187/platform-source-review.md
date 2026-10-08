# ST-187 Platform Source Review

**Decision: APPROVE**

Review scope: exact issuer/revocation source and focused tests against the accepted ST-187 task contract and platform/security plan approvals. This approval covers the internal development reference only, not HTTP wiring or production behavior.

## Findings

The implementation validates canonical IDs, strict own-context shape, and bounded observed/trusted times before mutation. It rechecks that the request session is live and owned by the active context owner, returns the same `missing` result for unavailable targets, and commits the tombstone and target deletion synchronously. Tombstones preserve the original owner, session, family, expiry, and transport binding.

Capacity and collision preflight now stages trusted-time expiry pruning. If revocation fails for capacity or collision, expired and live tombstones remain unchanged, the target remains present, and the request session remains present. On a successful commit, only expired tombstones are reclaimed before the new tombstone is inserted and the target is deleted. The focused regressions cover both preflight failure cases, including the collision branch through deliberately corrupted private test state because normal repository uniqueness prevents that state through public methods.

I initially misread the web-binding test's `f.target` as the revoked web row. The fixture creates a distinct web row (`web`, id 30) and neighboring mobile row (`f.target`, id 20). The final assertion correctly verifies that replay of the revoked web credential does not affect the neighboring session; no correction is needed there.

No QA or Git operations were performed by this review. QA status remains separate from this source approval.

## Reviewed source hashes

`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuer.ts`: `5420523fc2c5903aabf1cc35ecc0a5e725904e53f02edd02d3b54f42a652ba2c`
`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-revocation.spec.ts`: `9f635c8d72c3642cfc4970aaee0270bee2ad4eaa52d68c34067e494527d13529`
