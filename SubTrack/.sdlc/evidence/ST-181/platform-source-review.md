# ST-181 platform source review

**Decision: APPROVE.** The implementation preserves the limiter invariants and removes repeated full-map scans from requests before the earliest bucket expiry. The no-scan regression test deterministically bounds the 10,000-bucket fill to zero iterator visits; the due-expiry pass visits each entry once. The staggered-expiry case verifies that one expired slot is reclaimed while later buckets still keep the map at capacity.

`nextPruneAt` starts at infinity, is lowered when a bucket is created or its expiry is extended, and is recomputed from surviving entries after a due scan. An obsolete earlier lower bound can only cause an extra scan, not delay pruning. The scan retains the existing `now >= expiresAt` boundary and precedes the capacity check. Event ordering, sliding-window trimming, HMAC identifiers, per-window limits, and the 10,000-entry cap are untouched. Clock rollback leaves the bound conservative; updates continue to lower it with `Math.min`. The scan and mutation remain synchronous, with no timer, await, extra expiry structure, or unbounded state.

The tests meaningfully cover the bounded iterator work, a single pruning pass, expiry-based capacity release, and staggered expiry under capacity pressure. I found no blocking correctness or coverage gap for this focused optimization. Tests were not run as part of this independent source review.

Reviewed task `.sdlc/tasks/ST-181.md`, `AGENTS.md`, `docs/governance/CONSTITUTION.md`, both ST-181 plan reviews, the diff and focused context in the two authorized source/spec files. No source, Git, test, or configuration state was changed.

Source SHA-256:

- `apps/api/src/auth/otp-v2/otp-http.ts`: `58a57de8bdf29624ac36a39f5e36b39b0974c805f73cb015f075da46c82bea7b`
- `apps/api/test/otp-v2-http.spec.ts`: `4a4bcc6b8000d660f2b29286b8629ffe60808e78da2df33b8712b50a09b9b5c7`

Follow-up: reviewed the one-line iterator cast correction. It changes the test-only type from `Map` (whose iterator typing exposes `Symbol.dispose`) to a minimal iterable shape, with no runtime or assertion change.

Actual tool-call count: 5 (one tool-discovery call and four shell calls, including this artifact refresh).
