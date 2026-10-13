# ST244 conductor checkpoint

Android/iOS are the priority; web application work remains deferred and preserved. Accepted main is `70b3d2c0e1013febf1fd273874916f6b20a7d17b` (PR287). Active source is in `st/native-personal-subscriptions`, preparation commit `87d26782fc46bceee4f1a9e6cd145506db5a5dcc`, with uncommitted integrated implementation. There is no open feature PR or actual native qualification run yet.

## Current executable work

- Core backend: selector-free verifier, bodyless refresh, operation-specific headers, canonical subject derivation, strict cursor, narrow SQL015 privileges, trusted identity fields, final refresh checks and duplicate reservation409 corrections are written. Latest focused145 tests, API typecheck, contracts36 plus generated fixture and affected lint pass. Admission52, binding69, cursor33 and owner business85 branches are fully covered; authority/session/HTTP/server coverage remains incomplete. Core author is adding meaningful orchestration negatives. Final independent security delta review remains required.
- Native UI/session: language/theme application and wire mismatch corrections passed focused tests. Logout acknowledgement delta passed8 screen tests/typecheck and independent review. The reviewer found the related login rejection and shared awaited storage cleanup class; class-level correction and deferred interleaving tests are now written, unvalidated. Root owns the next focused Core/screen coverage, typecheck and lint run after backend releases the heavy slot. New Core hash `488d5404d941db5b85b1480ea10d939c1f16f672aee05513d3977dd17c2990b0`, screen `bce4d724e51960ed70fe2e46e8d2cd495140e00528b7a2dfd5692788535e810c`. Exact independent client delta review follows; prior Core coverage does not qualify this new delta.
- Runtime: hosted Android/Linux and iOS/macOS14/Xcode15.4 workflow, pinned tools, compile/install scripts, debug-only CA plugin, loopback Metro listener, natural device flows and sanitized driver are written. Source lint/syntax/CA/labels and actual Node loopback-listener checks pass. Independent runtime/platform/security source review is active. No installed binary or device result is claimed.
- Fixture: backend stream relinquished its previously unwritten launcher to a separate author. `private-mobile-owned-fixture.ts`, direct-TLS proof and shell provisioning/qualifier now exist; source syntax/lint/API typecheck pass. SQL isolation proof and backend workflow are being finished. Core and fixture authors have disjoint rosters; runtime consumes their frozen harness and receipt ABI. No actual PostgreSQL run is claimed.

## Final source update

All three independent source gates now approve actual qualification: security/platform, native client/design and QA. Final hashes and checks are in `source-review.md`. The login-proof rollback replay gap is corrected with a separately known-committed proof admission before session mutation;47 tests cover103/103 session branches. Actual PG proof rejects old-proof/new-key immediately and after API restart at the fourth-COMMIT fault. Contact role, key manifest, CA constraints, driver development mode, PR-head checkout and truthful API-restart receipt labels are corrected.

Root executed the native class-level tests: Core59 tests/62 branches/all metrics passed. One genuine-error screen regression failed, implementation corrected, unchanged screen tests10 passed, mobile typecheck and scoped lint passed; final client delta independently approved. Initial implementation details above are historical checkpoints, not remaining source blockers.

## Coordination and next gate

Authors and source reviewers have handed back final snapshots. No local heavy job is active. Root is preparing the coherent feature PR and hosted actual qualification; independent reviewers will consume the same-head run evidence and installed screenshots.

Next: create one coherent feature PR and run actual PG16 plus compiled/installed Android/iOS verification → profile → Just me → Add → API/app restart → fresh verified login → same persisted subscription. Qualify logout denial and refresh reuse/revocation through PG, storage failures through unit/mounted checks, and installed normal behavior/visuals at the same head. Installed fault scenarios are not claimed. All applicable CI and required reviews remain blocking for acceptance/merge. Do not stage coverage, generated native projects, credentials, OTPs, binaries or private logs.

No user action is required. First native build attempts are a planning estimate of two to four further active hours, low confidence until the older Expo51 toolchain and hosted builds execute. This estimate covers first attempts, not acceptance of the complete app or backlog. Full native completion has no defensible date yet. Hourly automation remains ACTIVE with the same schedule, mobile-first scope and no release/spending/accounts/real delivery authorization.

## C1 actual result and C2 retry

PR288 source head `661d8fd0c6363c82dfb2828c4f743f86dd5f1e7f` ran real PG16 proof38429054193 successfully. Independent actual QA approves the bounded backend result: scenario receipt, no credential/OTP disclosure patterns and verified owned cleanup. Receipt SHA256 `0688ac890e03acf80487587a82db3912ce1757eafc289437359f5ee59354f577`. This is backend proof, not native acceptance.

Native38429054068 stopped before compilation: Android sdkmanager was not on PATH; macOS CA test inherited platform certificate defaults and failed the strict CA predicate. C2 uses checked Android tool paths and isolated explicit CA signing configuration, with plugin/runtime behavior unchanged. Independent security approves this scoped compile retry.

Quality38429053940 found outdated enrollment-provider test fixtures and cold native test-host startup exceeding the first behavior deadline. Fixtures now preserve bilingual explicit-verifier/direct-entry/privacy behavior; generic host setup is separated from feature behavior. All5000ms behavioral deadlines/assertions remain unchanged. Full mobile28 suites/236 tests pass; cold affected18 tests pass, first workflow230ms rather than4429ms. Typecheck/lint pass and independent client/design approves the test-only delta. C2 also includes exact-head PG artifact identity so both new proof workflows run at the retry head. No API, SQL, session or product UI source changed in C2. Actual Android/iOS remains unrun and merge blocked until successful installs, visuals, cleanup and all applicable gates.

## C2 actual results and C3 startup correction

C2 head e8c40806d505600e2bfa1f75eceafb2a3ff3bd24: real PostgreSQL run38431034986 passed again; receipt digest53f49456d361ac2d3807edb9fb73fab0e6489e3e0ddaa68d330d7a3ac390c6ec. Android run38431034665 was cancelled to diagnose a silent startup stall: SDK/AVD completed in about40seconds, adb daemon started, then no progress. Exact emulator cause remains unknown; no native compile/install occurred, iOS did not execute.

C3 splits SDK/AVD/boot, bounds child/probe waits, checks owned process liveness/start identity and publishes sanitized diagnostic categories. SDK subprocess tests pass; Linux boot/cleanup await actual execution. Independent security approves this runtime source delta. Quality C2 stopped at two reviewed documentation false positives; exact historical fingerprints only are ignored, current prose clarified, scanner preserved. Mobile full28suites/236tests already pass with unchanged behavior deadlines; product source is unchanged.

Other C2 shared gates passed except private HTTPS profile browser: synthetic profile patch/read200 succeeded, reload navigation aborted. C1 same browser proof passed. Do not change web source or dismiss a relevant gate; inspect next exact-head result before determining reproducibility. Web product development remains deferred.

Next: push C3 to existing draft PR288 and qualify actual Android/iOS compiled installations, restart durable readback, screenshots and owned cleanup alongside exact-head PG/quality. No installed user-visible behavior is newly accepted. No user action required.
Independent security also approves native matrix max-parallel2: Android and iOS have isolated hosted runners/fixtures; fail-fast:false remains. This removes unnecessary cross-platform queueing while preserving local heavy-job ownership.
