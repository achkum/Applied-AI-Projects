# ST-222 platform C3 plan review
contract: REVIEW/v1
task_id: ST-222
reviewer: architect-platform
reviewed_plan_blob: 3c66b89346321f8dfc298f7f3f5f3aca026a4380
verdict: REQUEST_CHANGES

findings:
- severity: major
  file: SubTrack/.sdlc/evidence/ST-222/proof-plan.md:5
  issue: The accepted `InMemoryV2SessionRepository` and `SessionCsrfGuard` are process local. The plan does not say which process creates proof, session, token, and CSRF, or how that same authority instance reaches the ST-221 graph in the compiled Node child. A token minted in the test parent against a different repository will fail current-session checks.
  fix: State that the child constructs the accepted producer/store/issuer/access/resolver/CSRF instances and passes those exact instances to the unchanged ST-221 factory. Define a private, owner-only one-use credential handoff to the browser test, including access token, binding cookie, and CSRF token lifetime/destruction; never put them in argv, stdout, logs, or a committed artifact.
- severity: major
  file: SubTrack/.sdlc/evidence/ST-222/proof-plan.md:8
  issue: Revoked/expired authority tests cannot mutate the child's process-local repository or clock from the parent as written. Seeding PostgreSQL `session` rows does not revoke the v2 in-memory session used by this adapter.
  fix: Specify a bounded test-only private control/custody path to the child for accepted repository revocation and clock advancement, or prove expiry by waiting against the accepted clock. No public HTTP test route or new auth core; distinguish seeded PostgreSQL rows from v2 session authority.
- severity: major
  file: SubTrack/.sdlc/evidence/ST-222/proof-plan.md:7
  issue: Browser route fulfilment and cookie installation are named but the credential delivery order and browser cookie attributes are not. A browser page fulfilled at the exact HTTPS origin can produce natural POST Origin, but the proof must show the browser, not the test request API, sent the request with ambient `Secure; HttpOnly; Path=/v2` access/binding cookies and `credentials: 'include'`.
  fix: State the exact Playwright page/context mechanism, loopback certificate trust, cookie domain/path/SameSite/HttpOnly/Secure attributes, and observed raw HTTP evidence without logging credential values. Label installation as trusted fixture bootstrap, not login HTTP.

Platform-ready parts: ST-216 exact CID/nonce/creation/image/tmpfs/sole-loopback/full-URL ownership verification before Prisma; ST-221 unchanged closed `listen`/`close` graph and same ordinary `st221_runtime` pool; canonical migrations, SQL preflight, scoped GUC and no-write checks; exact resource cleanup and sanitized CI receipt. Preserve `browser_subscription_read_proof`, `fixture_owner`, one `subtrack_runtime` membership, and no ambient `DATABASE_URL`.

Budget gate: the missing cross-process custody/control path could make launcher, wrapper, integration, tests, and workflow exceed the granted 1600 own-line exception or L240. Before implementation, either fit it explicitly within those limits or propose a concrete split for an owned session/credential harness. This is plan readiness only; no source or CI verdict is implied.

## Revision 2 result (supersedes the readiness verdict above; history retained)
contract: REVIEW/v1
task_id: ST-222
reviewer: architect-platform
reviewed_plan_blob: a59a24f11d3c9c59c70078b5e5cf35c5af461bd8
verdict: APPROVE
findings: []

The child now owns the accepted proof, issuer, access, current-session repository, resolver and CSRF instances that enter the unchanged ST-221 graph. Strict one-use private IPC carries credentials to parent memory; fixed internal case handles control accepted revocation or injected-clock expiry without a public route. Playwright navigation is fulfilled only for GET at the exact HTTPS origin; POST reaches the direct Node listener with browser-generated Origin and ambient host-only Secure/HttpOnly/Lax `/v2` cookies. This explicitly proves a synthetic fixture bootstrap and actual browser read, not login HTTP or enrollment. Pinned Playwright 1.63 exists in `packages/ui/package.json`.

Source review must verify exact ST-216-grade provenance before Prisma, same ordinary pool/RLS/GUC checks, no credential values in evidence, and bounded child/listener/pool/fixture cleanup. The approved plan does not relax L240 or the <=1600 own-line ceiling; if implementation cannot fit, stop and propose the line-item harness split before widening paths. No implementation, browser, PG or CI result is approved by this plan verdict.

## Provisional source review (unfrozen draft; no C3 verdict)

The six implementation files are still being edited. The following findings are for the author to resolve before the normalized source manifest and final review. No actual PostgreSQL/Chromium CI result exists yet.

- **Major — browser wire evidence currently fails:** `apps/api/test/browser-subscription-read.integration.ts:145-173` calls `request.headers()` and then requires `cookie` to contain both names. Playwright documents that `headers()` omits security-related cookie headers; use `allHeaders()` on an unrouted POST or a narrowly scoped server observation, retaining names only. [Playwright Request API](https://playwright.dev/docs/api/class-request).
- **Major — required negative/probe cases absent:** the same integration test has no wrong/missing binding-cookie or mixed access/binding credential case, no server-observed wrong-Origin denial, and no independent HTTPS listener probe before Chromium. The present wrong-CSRF-on-peer case proves only CSRF rejection. Add exact browser/HTTPS assertions without setting forbidden browser headers.
- **Major — share fixture omitted:** `apps/api/test/browser-subscription-read.integration.ts:80-95` creates household members, open-book consent and subscriptions but no `subscription_share`, despite the task's explicit peer-share fixture. The visible peer read may succeed through the open-book fallback in canonical RLS; add an explicit active share case and assert its projection, retaining a private invisible row.
- **Major — ordinary pool and control claims unproved:** `browser-subscription-read.local.ts:168-174` ignores the result of `revokeForCurrentSession` and reports `controlled` even if revocation failed. The integration test ignores `poolClean`, then checks a separate `readerDb` Prisma pool at lines 191-195; this does not establish that the child pool's two transaction-local GUCs were cleaned or reused. Require successful accepted revocation, assert child-side pool result and a same-child pool reuse/rollback observation.
- **Major — coverage and receipt gate missing:** the workflow invokes wrapper integration only. The wrapper runs no changed-runtime coverage gate and writes a generic receipt without the exact source head or checked cases. Add >=80% each changed runtime coverage and a sanitized exact-head/case receipt after verified cleanup.
- **Major — fixture custody gap around create:** `tools/database/browser-subscription-read-proof.sh:62-69` writes Docker's newly created CID only to `$tmp/container.cid`; the EXIT trap's cleanup reads only `$RUNNER_TEMP/st222-container`, which is written afterward. An exit in that interval leaves an owned container untracked. Track a private pending CID in the trap or use a Docker `--cidfile` path that the trap verifies. Reject `-L` as well as `-e` for the record path before opening it, since a dangling symlink passes `! -e`.
- **Minor — control reply validation:** the parent control listener at integration lines 176-184 accepts matching `id` without checking `action`, `handle`, `poolClean`, or duplicate/replayed replies. Validate the full fixed response shape and clean up the listener/timer on failure.

## Final frozen source review (supersedes provisional findings; history retained)
contract: REVIEW/v1
task_id: ST-222
reviewer: architect-platform
reviewed_plan_blob: a59a24f11d3c9c59c70078b5e5cf35c5af461bd8
verdict: APPROVE
findings: []

I verified all eight source-manifest Git blobs against the working files: workflow `d878ec6559573007833e5bdedf9cd4270416ec96`, API package `9a64a85c8003b5aa834253d421a36d9a09510dcd`, lockfile `8179b4f20c91aa5a9297b6f6e97f941c03906327`, launcher `6f63274f7067b3304071ce2b9c43f74fc1ef7081`, launcher spec `6146ed7f32ae85ac5416d7d380127670d9ded983`, integration `891e289254a3f3fd12419c0cfed7fa475e8789a6`, Vitest config `fea35324f7fd60ec50a627272eddbd38750a809e`, and wrapper `d5ab5035c20fc212e516eb78656f345071b2844e`. This is approval of those exact source blobs only.

The pending name/nonce record now precedes `docker create`; the EXIT trap verifies exact CID/name/label/creation/image/tmpfs/sole loopback binding before removal, and rejects an existing or dangling-symlink record. The child checks private modes/ownership, exact live container and complete credential-bearing runtime URL before constructing Prisma or listening. It creates accepted producer, proof, issuer, repository, principal and CSRF authority in the child and injects the same instances into the unchanged ST-221 graph. Fixed-handle IPC controls accepted revocation or clock expiry, with successful revocation required before acknowledgement; no public authority route was added.

The integration now uses Playwright `allHeaders()` plus child HTTP observation of cookie *names/counts only* for a natural browser POST. It asserts Secure/HttpOnly/Lax host cookies, exact Origin, explicit share and private-row projections, money strings, identical invisible/missing 404, malformed/query/selector/CSRF/binding/mixed-credential denials, a separate wrong-Origin HTTPS probe, current revocation and expiry denial, and before/after no-write snapshots. The child acknowledges rollback and both clean transaction-local GUCs on the same single-connection ordinary pool. A compiled child is stopped with real SIGTERM, then a second child reuses the port and is stopped with real SIGINT; listener refusal and parent-only ordinary pool baseline are asserted after each. The workflow runs frozen install, compiled build, changed-runtime >=80% per-metric coverage, and owned PG16/Chromium proof without a skip; the wrapper writes an exact-head, sanitized case receipt only after verified cleanup.

The author reports 13/13 focused launcher tests, 86.86% statements, 82.09% branches, 82.6% functions, 94.4% lines, plus typecheck, build, ESLint and Bash syntax PASS. I inspected source, tests and hashes but did not rerun those jobs. Actual disposable PostgreSQL/Chromium execution, full API QA, security/client reviews and exact-head applicable CI remain blocking integration gates. This review establishes source readiness only; synthetic credential installation does not prove login HTTP, enrollment, persistent account UI or public release readiness.

## Corrected frozen source review (supersedes prior exact-source approval; history retained)
contract: REVIEW/v1
task_id: ST-222
reviewer: architect-platform
reviewed_plan_blob: a59a24f11d3c9c59c70078b5e5cf35c5af461bd8
verdict: APPROVE
findings: []

I reproduced all eight current manifest hashes. The wrapper is now `9fd19a19e2870ba38ebebc4fce41defd58482b59`; the other seven blobs remain exactly as listed in the previous review. This verdict applies to the corrected eight-blob manifest and supersedes the previous approval of wrapper `d5ab5035c20fc212e516eb78656f345071b2844e`.

The intervening security major was valid: an absent ownership record previously allowed normal `passed=true` cleanup to report success without proving fixture removal. The corrected normal finish supplies this invocation's CID, label, name and creation time; cleanup requires an owner-owned private `0600` record matching all four values, then verifies the exact inspected Docker resource and its removal before PASS. An absent or mismatched record now fails normal proof. The separate `--cleanup` path remains idempotent when no record exists. The added failure subphase copies only one of six fixed phase identifiers into a sanitized receipt; raw test output is never copied. I inspected this narrow correction and the author's reported Bash syntax/missing-record harness evidence; I did not rerun those checks.

The prior source findings remain resolved for these unchanged seven blobs. Independent QA reports 73 API files and 1,467 tests passed. Actual owned PostgreSQL 16/Chromium/compiled Node execution and exact-head applicable CI remain blocking. This is source readiness only, with no claim of HTTP login, enrollment, persistent accounts, UI or public release readiness.
