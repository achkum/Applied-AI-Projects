# ST-222 security/privacy C3 plan review

Contract: REVIEW/v1
Reviewer: security-privacy
Basis: task ST-222, ADR-0025, accepted ST-221 graph, ST-216 provenance/cleanup, v2 proof/issuer/session/CSRF ports.
Frozen plan blob: `3c66b89346321f8dfc298f7f3f5f3aca026a4380`.

Verdict: **REQUEST_CHANGES** for plan readiness. No runtime source has been reviewed or authorized.

| Severity | Finding | Required correction |
| --- | --- | --- |
| major | Lines 5–9 do not specify how credentials and session-CSRF move from the standalone child owning in-memory v2 authority to the parent browser driver, or how revocation/expiry is controlled. That gap could lead to stdout/receipt leakage or a public fixture endpoint. | State an inherited private child-to-parent channel, one-time delivery and memory-only custody for access/binding/CSRF, and test-only revocation/expiry control through the same channel. No public bootstrap/control route, raw secret in logs, or credential file. |

The proposed synthetic, pre-registered simulator proof and accepted issuer may support **trusted fixture bootstrap**. Browser-context installation of `Secure; HttpOnly` cookies must remain described as credential delivery, not HTTP login or enrollment. The browser POST must rely on natural Origin and ambient cookie behavior; JavaScript supplies only `{}` and session-CSRF. Route fulfilment may serve a page at the exact HTTPS origin, but must not intercept the read POST. These are conditions for revised-plan approval, not source findings.

## Revision 2 readiness

Frozen revised plan blob: `a59a24f11d3c9c59c70078b5e5cf35c5af461bd8`. **APPROVE Type 2a implementation readiness for this exact plan.** The earlier major finding is resolved in plan lines 5–10: the child alone owns accepted proof, issuer, current-session and CSRF instances; one-use credential envelopes cross inherited private IPC into parent memory; the browser context installs host-only Secure/HttpOnly cookies; and revocation/expiry control remains on private IPC with fixed case handles. No public fixture route or secret-bearing stdout/file/receipt is planned.

Plan lines 1–4 retain the ST-216 strong custody boundary: wrapper-created private record binds exact CID, nonce label, creation time, image, tmpfs, sole loopback port and full credential URL before Prisma/listen; one ordinary pool supplies accepted ST-221 preflight and scoped reads. Lines 9–11 make the actual browser POST un-intercepted, with naturally emitted Origin and ambient cookies, while the test page may receive the CSRF value. Only header names/cookie counts may enter evidence. Synthetic bootstrap is explicitly distinguished from an exercised session HTTP exchange, enrollment or account UI.

Implementation remains subject to exact-source security review, adversarial custody/provenance tests, actual PostgreSQL/browser/compiled Node CI proof, cleanup receipt, independent platform/client/QA and exact-head gates. This readiness verdict is no claim of source approval or full onboarding readiness. No High/Critical risk is accepted or overridden.

## Pre-freeze source review (draft implementation; no source verdict)

The six ST-222 source files inspected here are still mutable. The frozen plan remains approved; source approval is withheld until the author publishes an exact manifest and the actual browser/PostgreSQL proof runs in CI. Findings below are based on the draft at 2026-10-10 20:30 UTC and should be checked again at freeze.

| Severity | Draft location | Finding and required correction |
| --- | --- | --- |
| major | `apps/api/test/browser-subscription-read.integration.ts:145-173` | Playwright `request.headers()` omits security-related headers such as Cookie, so the asserted cookie names can be empty despite an actual browser request. Observe with `allHeaders()` or an exact-route child diagnostic that retains names/counts only; await the observation before asserting natural Origin and ambient cookies. Keep tokens out of receipts and errors. |
| major | `apps/api/src/subscriptions/browser-subscription-read.local.ts:149-179` | The frozen plan calls for server-side Origin and cookie-name/count evidence. The draft has no exact-route received-request observation; a browser request event alone does not prove what the child received. Record only bounded non-secret names/counts and exact Origin for successful POSTs, then assert them via the private IPC. |
| major | `apps/api/test/browser-subscription-read.integration.ts:164-188` | The planned Origin, missing/wrong binding, and mixed access/binding negatives are not exercised. A cross-origin browser fetch can stop at CORS preflight, which cannot establish the read POST's own Origin rejection. Prove the browser behavior honestly and add direct HTTPS POST evidence for the server's exact-Origin denial, plus browser credential-mixing/binding cases. |
| major | `apps/api/test/browser-subscription-read.integration.ts:175-195` | The private control response exposes `poolClean` but the test ignores it. Assert it for revocation and expiry, then demonstrate rollback and same-pool GUC isolation against the actual child pool; a separate reader Prisma pool alone cannot establish the child's pool cleanup. |
| major | `tools/database/browser-subscription-read-proof.sh:56-63` | `docker create` can create a resource before the exact CID/label is persisted in the cleanup record. If any command fails in that gap, `finish()` has no recorded resource to remove. Establish recoverable exact identity before creation or otherwise cover that failure window without broad cleanup. |
| major | `apps/api/src/subscriptions/browser-subscription-read.local.ts:107-113`, `:149-179` | Shutdown bounds `app.close()` and Prisma disconnect but does not guarantee completion after a timeout; a late listener/pool/IPC handle may survive until the parent kills the child. Verify signal/startup-failure cleanup with compiled Node and external probing, including late startup and pool disconnect. Preserve fail-closed proof on cleanup failure. |

The draft keeps the accepted child-local authority and one-use private IPC direction, full credential URL fixture comparison before Prisma, loopback HTTPS, and sanitized stderr intent. Those are provisional observations, not a source verdict. No High/Critical waiver is recorded.

## Frozen source review — C3 REQUEST_CHANGES

Contract: REVIEW/v1
Reviewer: security-privacy
Basis: approved revision 2 plan blob `a59a24f11d3c9c59c70078b5e5cf35c5af461bd8`, accepted ST-221 private composition, and all eight normalized blobs in `source-manifest.md`. Each listed blob was independently reproduced with `git hash-object` at review time.
Verdict: **REQUEST_CHANGES** for exact-source security readiness. Actual owned PostgreSQL 16, Chromium and compiled Node CI proof remains pending; this is a source review only.

| Severity | Frozen location | Finding and required correction |
| --- | --- | --- |
| major | `SubTrack/tools/database/browser-subscription-read-proof.sh:12-13,49-65` | `cleanup_container()` returns success when the ownership record is absent, and `finish()` may then emit `PASS` whenever `passed=true`. A lost or removed record can therefore yield `fixture=removed` without proving that the task-labelled container was removed. For the normal successful proof path, require the exact private record/CID/label created by this invocation to exist and verify its removal before writing PASS. Keep the separate `--cleanup` entry idempotent for the no-record case. Add a focused failure-path check for missing record before PASS. |

The earlier draft majors are otherwise addressed in these frozen blobs: the child creates the accepted simulator proof, issuer, session repository, resolver and CSRF guard and injects those same authority objects into ST-221; one-use credentials and fixed controls cross inherited IPC, with ignored child stdout/stderr and no public bootstrap route. The parent uses separate browser contexts, Secure/HttpOnly/Lax `/v2` cookies, exact-origin HTML GET fulfilment, and an un-intercepted browser POST. It awaits Playwright `allHeaders()` and checks bounded server-side Origin/cookie-name counts. Wrong Origin is probed directly over HTTPS; binding, mixed credentials, CSRF, identity selectors, 404 equivalence, projection, revocation and expiry are asserted. The child reports same-pool rollback/GUC cleanup and the integration asserts that report, row snapshots, SIGTERM/SIGINT listener refusal and ordinary-role connection return to baseline. The wrapper uses a private pending name/label before Docker creation, validates the full credential URL before Prisma, constrains cleanup to an exact inspected resource, and limits the receipt to fixed non-secret fields. The pinned API coverage provider and workflow dependency paths are present.

This review does not claim browser, database or CI execution, complete HTTP login/enrollment, persistent accounts, or release readiness. Re-review the corrected wrapper blob and manifest, then require actual exact-head CI, independent reviews and QA. No High/Critical risk is accepted or overridden.

## Corrected frozen source review — C3 APPROVE source readiness

Contract: REVIEW/v1
Reviewer: security-privacy
Basis: unchanged approved plan blob `a59a24f11d3c9c59c70078b5e5cf35c5af461bd8`, corrected wrapper blob `9fd19a19e2870ba38ebebc4fce41defd58482b59`, and seven unchanged source blobs listed in `source-manifest.md`. All eight manifest hashes and the plan hash were independently reproduced with `git hash-object`; corrected wrapper passed Git Bash syntax locally.
Verdict: **APPROVE exact-source security/privacy readiness**, conditional on actual owned PostgreSQL 16/Chromium/compiled Node exact-head CI proof and its verified cleanup receipt. This supersedes the preceding source REQUEST_CHANGES while retaining that review history.

The prior major cleanup finding is resolved: normal `passed=true` finish supplies this invocation's CID, nonce label, name and creation time to `cleanup_container()`. A missing, unsafe or mismatched private 0600 owner record now fails that path before PASS. Cleanup then checks the exact inspected resource and removal; the separate `--cleanup` entry remains idempotent for an absent record. The author's focused shell harness reports that missing-record PASS is denied and idempotent cleanup succeeds; I did not rerun that harness or the browser/database integration. Integration failure subphase is selected only from fixed phase names and never copies raw test output into the receipt.

No unresolved High/Critical or major source finding remains in this exact manifest. This verdict does not approve the task gate, deployment, enrollment/login HTTP, persistent accounts, account UI or public release. Actual CI, QA and required exact-head gate audit remain blocking; any source change requires a new manifest and review.

## Regression correction and final wrapper re-review

The preceding source approval for wrapper blob `9fd19a19e2870ba38ebebc4fce41defd58482b59` was **superseded**: root's rerunnable `cleanup-negative-check.sh` executed the actual `finish()` function with `passed=true` and no ownership record and observed an incorrect PASS. In Bash, the prior missing-record branch's `return` preserved the successful status of `[[ "$#" -eq 0 ]]` in this call context. Syntax and the earlier claimed one-off harness result did not establish the required denial. That blob is rejected for this finding.

Contract: REVIEW/v1
Reviewer: security-privacy
Reviewed wrapper blob: `50c66cd43ad40f968367cf7d1428c4c78cec17d3`; the seven other source blobs and approved plan blob remain as listed in the updated `source-manifest.md`. All eight source hashes were independently reproduced.
Verdict: **APPROVE exact-source security/privacy readiness for this manifest**, with actual owned PG16/Chromium/compiled Node CI and exact-head gate evidence still blocking.

The missing-record branch now uses explicit `return 0` only for the argument-free standalone cleanup and `return 1` for normal `passed=true` cleanup with four expected identity fields. I ran Git Bash syntax and root's rerunnable `.sdlc/evidence/ST-222/cleanup-negative-check.sh` against the corrected wrapper from the project directory; both passed, and the check exercised the real `finish()` missing-record path plus standalone cleanup idempotency. This closes the prior major finding at source level. No High/Critical waiver is recorded. Any later workflow or source re-freeze needs hash verification and a scoped re-review before exact-head approval.

## Final nine-blob manifest review — C3 APPROVE source readiness

Contract: REVIEW/v1
Reviewer: security-privacy
Basis: final nine-blob `source-manifest.md`, including workflow blob `24259806a74090e505774375f6fb30f91d77a480`, corrected wrapper blob `50c66cd43ad40f968367cf7d1428c4c78cec17d3`, and regression harness blob `73c735162e017b7375a566d9da4ef819d8b292dc`. I independently reproduced all nine listed hashes.
Verdict: **APPROVE security/privacy source readiness for this exact manifest**; actual CI and task gate remain pending.

The workflow now runs the versioned missing-record regression check before the owned browser proof and includes the check in its pull-request path filter. The check sources the wrapper's actual `cleanup_container()` and `finish()` functions, requires a FAIL receipt and exit 1 when `passed=true` has no record, and confirms argument-free cleanup remains idempotent. I reran Git Bash syntax for wrapper and harness and executed the harness from `SubTrack/`; all passed with its fixed non-secret PASS message. This closes the previous false approval's regression at source level. The other seven source blobs retain the prior reviewed behavior. Actual owned PostgreSQL/Chromium/compiled Node exact-head CI, verified cleanup receipt, independent QA and required-check audit remain blocking. No High/Critical waiver or release claim is made.
