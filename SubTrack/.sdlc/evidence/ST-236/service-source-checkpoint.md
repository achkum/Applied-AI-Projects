# ST-236 service source checkpoint
1. Owner: service and focused spec only; original L240 clock 2026-10-11T09:44:30.897Z remains active.
2. Read task, Constitution, ADR26–28, frozen author/security/platform readiness, SQL001–009 and accepted bootstrap/verifier/profile ports.
3. Fixed constructor/method signatures sent to actual-PG proof author; nine distinct copied keys and development-only synthetic OTP code supplier.
4. Accepted bootstrap hides chain; service derives it with fixed SQL003 `peek` from the bound nonce/cookie, never takes caller chain as authority.
5. Frozen SQL010 signatures and terminal role sequence coordinated with SQL author.
6. Source now implements all five transitions, independent burns, known/unknown commit handling, terminal owner-RLS transaction and strict copied config.
7. SQL author fixed wrong-code path: attempts 1–4 retain same nonce and commit; fifth consumes it. Service returns generic failure after known COMMIT.
8. Verified nonce purposes: start enroll_identifier; verify/admit/person otp_step_up; terminal session. Source updated.
9. Last typecheck had only three local purpose-union errors; patched union, rerun pending. No focused spec yet.
10. Rotation needed at 20-call specialist limit; next agent must inspect SQL010 exact predicates, run source typecheck, author focused tests, coordinate PG proof.

## Service completion rotation at ~10:08Z
11. New focused `durable-development-enrollment.spec.ts` covers copied config, normalized issuance, wrong-code known COMMIT, unknown COMMIT nondisclosure, role/dual-GUC reset sequencing, proof admission, late trusted verifier, final commit ordering, active-subject rollback/login response, malformed web/clock and late verifier method replacement.
12. Targeted `corepack pnpm exec vitest run src/auth/enrollment-v2/durable-development-enrollment.spec.ts` passed 11/11 after verifier capture at ~10:07:50Z. Parent owns integrated typecheck. No actual PG claim from this lane.
13. Service now captures/binds trusted verifier `verify` at construction, matching accepted ST-235 dependency capture; method replacement later cannot alter producer. The new case has not yet run. Service refresh domain exactly matches ST-235 refresher (`subtrack:auth-refresh:v2:`); CSRF domain exactly matches `durable-session-csrf` (`subtrack:v2:session-csrf:core:v1:token:`). Proof author was asked to verify current authority compatibility in PG.
14. SQL author reported no signature or role changes; inspected current SQL010 names/grants match service calls. SQL author is auditing binding `xmin`/column grant. Do not widen grants without independent review.
15. Root found accepted ST-235 current-session compatibility blocker after this run: SQL010 session `binding_h` persists bootstrap `sha('cookie', rawBase64)` whereas current authority requires `hashBrowserBindingCookie(cookie)` using decoded bytes and a distinct domain; current service also returns plain base64url refresh rather than accepted `v2r.` format. Parent is classifying exact additive source contract/security delta before edits. Do not silently change SQL/authority or assert usable current-session graph. Specialist call limit reached; STOP. Original L240 deadline 2026-10-11T13:44:30.897Z and author/PR caps remain unchanged. Remaining: contract review/fix, integrated typecheck with root, actual PG proof and exact-head reviews/CI with other lanes.
