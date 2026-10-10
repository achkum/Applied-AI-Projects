# ST-208 independent QA

Date: 2026-10-10. QA scope: final idempotency guard and anonymous enrollment test source, plus API contract wording. No implementation source was changed during this QA pass.

## Result

PASS for the focused core gate. The anonymous branch remains a narrowly scoped request-isolation reservation: its separately branded digest and explicit purpose do not establish identity. The API contract exception names only mobile `startV2Otp` and `verifyV2Otp` with `enroll_identifier`; `otp_step_up` stays outside the exception.

## Independent verification

- `corepack pnpm --filter @subtrack/api exec vitest run src/auth/idempotency/idempotency-guard.spec.ts src/auth/idempotency/anonymous-enrollment.spec.ts --coverage.enabled --coverage.provider=v8 --coverage.include=src/auth/idempotency/idempotency-guard.ts --coverage.reporter=text --coverage.reporter=json-summary --coverage.reportsDirectory=.sdlc/evidence/ST-208/coverage` — 2 files and 20 tests passed.
- Changed guard coverage: statements 71/72 (98.61%), branches 81/82 (98.78%), functions 14/14 (100%), lines 62/63 (98.41%). All exceed the 80% changed-file gate. Generated summary: `.sdlc/evidence/ST-208/coverage/coverage-summary.json`.
- The focused tests exercise successful reserve and completed settlement for both anonymous operations; type negatives for digest-brand distinction and operation/transport/purpose restrictions; runtime rejection of malformed and cast-invalid kind/operation/transport/purpose tuples during reserve and settle; exact existing browser-chain, verified-principal and browser-bootstrap-origin binding vectors; the anonymous framed-purpose vector; global cross-kind key burns; owner, binding and request-digest mismatches; failed/completed replay prevention; TTL and capacity behavior.
- The API contract contains only the narrow enrollment exception and explicitly states the anonymous digest grants no principal/account authority and does not authorize `otp_step_up`.

## Source identity and failures

SHA-256 of `apps/api/src/auth/idempotency/idempotency-guard.ts` at QA: `7C3BBCDB76905804DDF1ABF81C9D587DA0CE816AF406D5616840960BC6D90019`.

No focused test or coverage failures occurred. The pre-existing core handoff records API lint, typecheck and full API suite as passing; this QA dispatch was limited to the focused idempotency tests and changed-file coverage, so those broader checks were not repeated. No DB, endpoint, delivery, network, deployment, or branch operation was performed.


## Final test-fixture correction recheck

After the compile-time negative specimens were corrected to include the common required reservation fields, I reran the focused idempotency suite: 2 files, 20 tests passed. `corepack pnpm --filter @subtrack/api typecheck` also passed (including Prisma client generation and TypeScript compilation). The final `anonymous-enrollment.spec.ts` SHA-256 is `3B003ADA84B99677390282DE704BEDA6B82937881E021194E56E5F6F087C3B81`; the guard source hash remains `7C3BBCDB76905804DDF1ABF81C9D587DA0CE816AF406D5616840960BC6D90019`. These valid-shape type negatives now isolate the intended operation/transport/purpose/digest-brand incompatibilities. Coverage is unchanged because the guard source did not change.
