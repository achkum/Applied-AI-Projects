# ST-187 independent security source review

**Decision: APPROVE.** The reviewed correction resolves the capacity failure finding. Revocation now computes the unexpired tombstone count, detects collisions, and stages expired hashes without mutating the map. It returns `capacity` before any tombstone or session mutation; on success, it prunes expired tombstones, inserts the target tombstone, and deletes only the target session within the synchronous commit section.

## Review findings

The implementation validates canonical request and target IDs, strict own-context shape, observed and trusted clock bounds, and the live active request session before target lookup. Missing, foreign, expired, and future-created targets share the `missing` result. The successful path retains the target's owner, session, family, original creation/expiry, and transport binding in a tombstone before removing its row. Self-revocation and matching-transport replay behavior are covered. The new failure tests verify that collision and full-capacity outcomes preserve both expired and live pre-existing tombstones, plus request and target rows. The test fixtures deliberately inject private state because normal uniqueness constraints make these defensive collision/full-with-expired combinations unreachable through the public setup API.

The earlier review identified that `pruneConsumed` ran before the capacity check, allowing a failed operation to delete expired tombstones. The implementation was corrected to stage pruning and commit it only on success. This approval is limited to the reviewed source behavior and does not attest QA, CI, Git state, secret scanning, or task acceptance.

## Exact reviewed source hashes

`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuer.ts`: `5420523fc2c5903aabf1cc35ecc0a5e725904e53f02edd02d3b54f42a652ba2c`

`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-revocation.spec.ts`: `9f635c8d72c3642cfc4970aaee0270bee2ad4eaa52d68c34067e494527d13529`
