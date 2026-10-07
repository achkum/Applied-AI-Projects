# ST181 Security Plan Review

**Decision: APPROVED for the proposed source change.** The `nextPruneAt` lower bound is conservative as described: it is the minimum observed expiry and may become stale only by remaining earlier than the current expiry after an event extends that bucket. That can trigger an extra full scan, but cannot delay removal past any bucket's actual expiry. New or updated buckets must always lower the bound with `Math.min`; after a due full scan, recomputing it from all surviving buckets (or `Infinity` when empty) preserves the invariant.

Capacity and fail-closed behavior remain intact if the due prune scan completes before the existing capacity check and insertion. A clock rollback makes `now >= nextPruneAt` false until the clock catches up, matching current expiry behavior; a newly created bucket still lowers the bound if its computed expiry is earlier. The existing per-bucket event ordering check and sliding-window trimming should remain unchanged. No new bypass or unbounded state is introduced; the map remains capped at 10,000 entries.

Keep regression coverage for expiry at the boundary, staggered expiries, a full-capacity map becoming reusable after expiry, and the pre-deadline no-scan iteration count. The test should observe the bucket-map iteration directly without adding production instrumentation or a wall-clock threshold. The described private-map test cast is acceptable if narrowly typed and confined to the focused spec.

Reviewed: `/workspace/.setup/ST181-task-draft.md`, repository `AGENTS.md` and Constitution, `apps/api/src/auth/otp-v2/otp-http.ts`, and the focused limiter tests in `apps/api/test/otp-v2-http.spec.ts`.

Actual tool-call count: 3 (two read calls and this artifact write).
