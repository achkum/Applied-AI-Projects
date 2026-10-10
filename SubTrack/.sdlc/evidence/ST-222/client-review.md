# ST-222 architect-client C3 plan review
contract: REVIEW/v1
task_id: ST-222
reviewer: architect-client
reviewed_plan_blob: a59a24f11d3c9c59c70078b5e5cf35c5af461bd8
verdict: APPROVE

findings: []

Revision 2 closes the client majors on frozen blob `3c66b89346321f8dfc298f7f3f5f3aca026a4380` (prior verdict `REQUEST_CHANGES`): the compiled child owns the accepted proof, issuer, access, current-session and CSRF instances injected into the unchanged ST-221 graph; inherited private Node IPC delivers one-use credentials to parent memory and carries fixed revocation/clock controls. No public credential or control route is planned.

The browser sequence is now concrete. Playwright installs host-only `Secure; HttpOnly; SameSite=Lax; Path=/v2` access and binding cookies, fulfils only the exact-origin HTTPS page GET, and lets page `fetch` send the actual POST with `credentials: 'include'`, `{}`, `Content-Type` and session CSRF. The browser supplies Origin and Cookie; JavaScript never sets either forbidden header. The proof must observe raw server-side Origin and cookie names/counts without values and demonstrate the cookies are unreadable from page JavaScript. The read POST must reach the standalone Node listener un-intercepted.

The plan uses existing Playwright 1.63.0 through `createRequire(packages/ui/package.json)` and the current CI Chromium install command, with explicit loopback TLS handling. Source review and QA must still verify those claims, including fresh owner/peer browser contexts and real denial cases. Cookie installation remains trusted synthetic fixture bootstrap; this approval does not claim login/session HTTP exchange, enrollment, persistent account, or user-facing readiness. Platform and security must independently approve this exact revised blob before source edits.

## Pre-freeze client source audit (draft; no source verdict)

The six implementation files remain mutable. The frozen Type 2a plan approval above does not approve this draft or replace actual browser/PostgreSQL CI evidence. Recheck these findings against the normalized final source manifest.

| Severity | Draft location | Finding and required correction |
| --- | --- | --- |
| major | `apps/api/test/browser-subscription-read.integration.ts:159-197` | Browser request evidence is collected by an unawaited `request.allHeaders()` promise, then checked after an arbitrary 100 ms delay. This can fail despite a valid request, or allow an unhandled rejection. Await an observation tied to the exact owner POST before asserting its natural Origin and ambient cookie names. [Playwright Request API](https://playwright.dev/docs/api/class-request#request-all-headers) confirms `allHeaders()` includes cookie headers. |
| major | `apps/api/test/browser-subscription-read.integration.ts:114,219-220` | Equal `subscription` row counts do not prove no writes: an update or replacement can preserve the count. Compare bounded seeded row and share snapshots (plus any relevant audit state) before and after browser cases, or use another concrete write-detection assertion. |
| major | `tools/database/browser-subscription-read-proof.sh:117-125` | The new API Vitest coverage invocation needs the matching `@vitest/coverage-v8` plugin, but `apps/api/package.json` does not declare it and no API or root `node_modules` link exists in this workspace. Verify frozen-install CI resolution; if missing, request a scoped dependency/lockfile change because those files are outside ST-222 `allowed_paths`. The coverage gate must fail closed. |
| minor | `apps/api/test/browser-subscription-read.integration.ts:170-173` | The peer projection assertion checks only visibility, amount and absent `customName`. Assert its exact field set so additional owner-only fields cannot escape unnoticed. |
| minor | `apps/api/test/browser-subscription-read.integration.ts:199-214` | The parent control promise accepts `controlled` by id alone and retains listener/timer on timeout or send failure. Validate the one-use ACK's action, handle and bounded shape; remove listener and timer on every outcome. |
| minor | `apps/api/test/browser-subscription-read.integration.ts:148` | The route handler fulfils the exact page URL but does not check the request method. Assert the fulfilled request is the intended HTML GET navigation; keep every read POST unrouted. |

The current draft uses `credentials: 'include'`, a same-origin page `fetch` supplying `{}` and session CSRF, host-only Secure/HttpOnly/Lax `/v2` cookies in separate owner/peer contexts, and a separate direct Node probe for forged Origin. Those are source observations only. Node 22.18 [documents](https://nodejs.org/download/release/v22.18.0/docs/api/diagnostics_channel.html#built-in-channels) the `http.server.request.start` payload used for sanitized server receipt counts, but the experimental event must appear in actual compiled Node CI; absent observations must fail the proof. Full onboarding and session HTTP exchange remain unproven.

## Final architect-client source review (frozen author candidate)

contract: REVIEW/v1
task_id: ST-222
reviewer: architect-client
verdict: **APPROVE source only; actual owned PostgreSQL/Chromium CI and exact-head gates pending**
reviewed_plan_blob: `a59a24f11d3c9c59c70078b5e5cf35c5af461bd8`

All eight normalized `git hash-object` values match `.sdlc/evidence/ST-222/source-manifest.md`: workflow `d878ec6559573007833e5bdedf9cd4270416ec96`, API package `9a64a85c8003b5aa834253d421a36d9a09510dcd`, lockfile `8179b4f20c91aa5a9297b6f6e97f941c03906327`, launcher `6f63274f7067b3304071ce2b9c43f74fc1ef7081`, launcher spec `6146ed7f32ae85ac5416d7d380127670d9ded983`, browser integration `891e289254a3f3fd12419c0cfed7fa475e8789a6`, Vitest config `fea35324f7fd60ec50a627272eddbd38750a809e`, wrapper `d5ab5035c20fc212e516eb78656f345071b2844e`.

The pre-freeze client findings are corrected in this candidate. The owner POST observation is tied to the exact request and `allHeaders()` is awaited (`integration.ts:217-230`); the fulfilled route asserts the HTML `GET` (`203-207`). The peer response has an exact field-set assertion (`235-241`), and bounded fixture row/share/audit snapshots before and after the cases detect writes beyond equal counts (`137-148`, `294-295`). The IPC control ACK validates action, handle and bounded sanitized observation shape and removes its listener/timer on success, timeout or send failure (`262-289`). The matching API `@vitest/coverage-v8` 4.1.11 link is declared in the frozen package and lockfile; wrapper coverage fails closed at 80% per changed-runtime metric (`proof.sh:125-134`).

Separate Chromium contexts install only the access and binding cookies with `Secure`, `HttpOnly`, `SameSite=Lax` and `/v2` path, then verify JavaScript sees no cookie (`integration.ts:192-214`). The page supplies only JSON `{}`, session CSRF and `credentials: 'include'`; the exact owner POST's observed headers must contain browser-generated Origin and both ambient cookie names (`46-53`, `225-230`). Only the exact page GET is fulfilled, so read POSTs reach the compiled loopback HTTPS listener. The child also records sanitized raw server Origin/cookie counts and the parent requires a valid receipt before accepting a control ACK (`local.ts:105-124`; `integration.ts:274-283`). Source has no browser code setting Origin or Cookie and makes no generated SDK forbidden-header claim.

Owner and peer projection, canonical large positive/negative minor-unit strings, identical invisible/missing 404, malformed JSON, query and identity selector rejection, wrong and mixed bindings, wrong CSRF, forged Origin, revoked peer and expired owner are asserted (`integration.ts:226-293`). Forged Origin uses a direct Node HTTPS probe because browser script cannot set Origin. The before/after snapshot covers seeded subscription, share, identity, household, membership, consent, merchant and audit rows; rollback and pool GUC baseline are separately checked. The accepted ST-220 adapter remains responsible for exact problem and `no-store` behavior; this integration does not independently assert response headers.

This is a source verdict on the frozen fixture proof. Cookie installation and child IPC are trusted synthetic bootstrap, not actual enrollment, login/session HTTP exchange, durable accounts, production browser routing or UI readiness. The Playwright/Node/PG run and server diagnostic observations have not been observed by this reviewer; CI must demonstrate them at the exact PR head before merge. Any source change requires a new manifest and review.

## Narrow final source re-review after cleanup correction

contract: REVIEW/v1
task_id: ST-222
reviewer: architect-client
verdict: **APPROVE corrected source only; exact-head CI pending**

The prior eight-blob source verdict is historical. I rechecked the current nine-blob `.sdlc/evidence/ST-222/source-manifest.md` against `git hash-object`; all nine match. Six API/package/lockfile blobs remain unchanged. The changed workflow is `24259806a74090e505774375f6fb30f91d77a480`, wrapper is `50c66cd43ad40f968367cf7d1428c4c78cec17d3`, and new negative-check harness is `73c735162e017b7375a566d9da4ef819d8b292dc`.

The wrapper's successful finish now calls `cleanup_container` with its exact recorded CID, label, name and creation time. A missing record in that path explicitly returns failure, turns the receipt into `FAIL phase=cleanup`, and prevents a false PASS; standalone `--cleanup` stays idempotent. The versioned harness exercises this missing-record behavior without provisioning a container, and the workflow runs it before Chromium/browser proof and includes its path in the PR trigger. The browser integration and launcher blobs are unchanged, so the natural-Origin, ambient-cookie, projection, denial and no-write source findings above still apply. The wrapper's new failure subphase reports only fixed generic phase labels; it does not copy raw test-log content into the receipt.

This re-review does not claim that I ran the harness or owned PostgreSQL/Chromium proof. The root-reported harness result and full API QA are separate evidence; exact-head CI remains blocking. Synthetic cookie and authority bootstrap still does not establish login/session HTTP exchange, enrollment, persistent accounts or UI readiness.
