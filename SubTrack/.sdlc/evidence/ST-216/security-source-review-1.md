# ST-216 security/privacy source review 1 — 2026-10-10

Verdict: **HOLD, source-only snapshot**. This is an early review of four untested runtime files, not approval of HTTP/PostgreSQL behavior or the eventual PR head. No runtime source was changed by this reviewer.

Reviewed normalized Git blobs (`git hash-object --path=<repository path>`):

| File under `apps/api/src/subscriptions/` | Blob |
| --- | --- |
| `subscription-lifecycle.controller.ts` | `084341ec575b717d478e4769b5431926bee96d1d` |
| `subscription-lifecycle.service.ts` | `955f6d00bfc55186f3acb7fd6d53235c40901613` |
| `subscription-lifecycle.http-composition.ts` | `5d520e42c421e827eee7d6b5200fc8e239f7b4ae` |
| `subscription-lifecycle.local.ts` | `e280acca016419789b7d0c7383afbaa98d0b8699` |

Findings at these blobs:

1. **Malformed JSON maps to 500.** Express's body parser raises a 400 syntax error before the controller for invalid JSON. `SubscriptionLifecycleProblemFilter` recognizes only `HttpException`, so this ordinary malformed request is projected as masked 500. The accepted contract requires 400. Scope the 400 recognition to parser errors without trusting arbitrary thrown `.status` values. The author/root already identified this issue.
2. **Response error codes diverge from the accepted OpenAPI enum.** The filter emits `INVALID_SUBSCRIPTION_LIFECYCLE`, `UNAUTHORIZED`, and `SUBSCRIPTION_LIFECYCLE_FAILED` for 400/401/500; the contract defines `INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST`, `AUTHENTICATION_REQUIRED`, and `INTERNAL_ERROR`. The root has notified the author. Recheck the final blob.
3. **Duplicate JSON member names can pass the exact-one-field gate.** `SubscriptionLifecycleService` validates `Object.keys()` after JSON parsing. A wire body such as `{"status":"ACTIVE","status":"PAUSED"}` becomes one `status` key under ordinary `JSON.parse` and can reach the writer. The readiness decision says to reject any non-exact one-field JSON body. Reject duplicate raw member names at the HTTP boundary, or obtain an explicit contract interpretation if duplicate JSON names are accepted.

Aligned in this snapshot: raw `originalUrl` query rejection covers parser-discarded keys; path/status validation, no caller-selected authority, target-to-action dispatch, APP_GUARD and real current-session resolver/reader, locked private writer use, bounded success projection, loopback-only binding, and same-pool role/RLS/SELECT/UPDATE preflight. The direct entry checks private provenance, exact CID/label/creation/image/tmpfs/port and exact full runtime URL including credential before Prisma construction. The factory injection is the trusted harness seam described by ADR-0024; it is not a standalone provenance verifier.

Outstanding gates: re-review changed source blobs; focused unit and real HTTP/ordinary-role PostgreSQL proof for all seven pairs, owner/peer separation, malformed/spoofed inputs, revoked/wrong-subject sessions, races, rollback and pooled RLS cleanup; exact-head coverage, API quality/CI, fixture cleanup receipt and independent QA/platform review. No PASS claim is made for those unseen results.
