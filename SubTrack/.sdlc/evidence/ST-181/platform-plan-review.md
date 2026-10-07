# ST181 platform review

**Decision: approve the proposed `nextPruneAt` optimization and the deterministic iterator-count regression, with the test details below.** It preserves the limiter's current behavior while changing the routine path from a full-map scan to a timestamp comparison. No design blocker found.

## Correctness review

`nextPruneAt` is a conservative lower bound if it starts at `Infinity`, is reduced on bucket creation and every `expiresAt` update, and is recomputed as the minimum surviving `expiresAt` (or `Infinity`) whenever a scan runs. When an earliest bucket is extended, retaining its old earlier timestamp can trigger an unnecessary scan, but cannot postpone pruning. The recomputation must happen after deleting every bucket with `now >= expiresAt`.

This retains the existing expiry boundary (`now >= expiresAt`), sliding-window event eviction, 10,000-bucket fail-closed check, and rate-limit/HMAC behavior. Clock rollback also remains safe: a timestamp below the bound causes no scan, just as the current scan would find no newly expired bucket; any expiry changed on an accepted request must still lower the bound with `Math.min`. Keep the no-await synchronous path and avoid timers or auxiliary expiry structures.

## Test guidance

Keep the existing sliding-window and 10,000-capacity assertions. Add a staggered-expiry capacity case that establishes one earlier and one later expiry, verifies that the first expired bucket frees exactly one slot, and verifies capacity still rejects while the later buckets remain active. This catches stale-bound and premature-capacity-release errors. A rollback case is useful if the focused test can express it without broadening scope: moving `now` backwards must neither prune an active bucket nor break the existing out-of-order-event rejection.

Instrument the private map iterator in the spec through an explicit `unknown` cast and count yielded entries. Fill 10,000 distinct buckets at a fixed time and assert the aggregate scan count is bounded by one map pass (10,000); with the proposed optimization it should be zero before the first expiry, while the old implementation counts 49,995,000. Then advance to expiry and assert pruning consumes at most one pass and capacity is available. Avoid elapsed-time assertions and global timeouts.

## Scope and handoff

The task draft's two source paths are sufficient for the implementation and regression coverage. This review does not authorize changing metadata, Git state, or other source files. The task draft itself notes that the ST180 uncommitted candidate must be preserved and isolated before any Git switch or commit; retain that as a separate execution prerequisite for the author.

**Actual tool-call count:** 3 (two batched read calls and this artifact write).
