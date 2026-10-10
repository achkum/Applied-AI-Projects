# ST-208 core and contract verification

Source review handoff, 2026-10-10. Scope: the idempotency core, its tests and the narrow API_CONTRACT exception. This is not an HTTP adapter, anonymous digest producer, identity assertion, OTP delivery path or deployment approval. Independent platform/security source review, QA and exact-head CI remain open.

## Behavior exercised

- `AnonymousRequestDigest` uses a separate brand from `TrustedAuthorityDigest`; `AnonymousEnrollmentReservationInput` requires the `anonymous-enrollment-otp` kind, mobile transport, `enroll_identifier` purpose and only `startV2Otp` or `verifyV2Otp`.
- Reserve and settle reject cast/unknown invalid operation, transport, purpose, kind and malformed digest inputs generically. Existing authority branches reject any extra purpose selector, including an explicit `undefined` value.
- Anonymous start and verify settle successfully. Key burns remain global across authority kinds; wrong owner/binding, completed or failed settlement, TTL and capacity behave as before.
- Three literal binding digest vectors cover existing browser-chain, verified-principal and browser-bootstrap-origin branches. One literal vector covers the new six-field anonymous binding. Existing binding bytes are unchanged.

## Local verification

- `corepack pnpm --filter @subtrack/api exec vitest run src/auth/idempotency/idempotency-guard.spec.ts src/auth/idempotency/anonymous-enrollment.spec.ts`: 2 files, 20 tests passed, including after final type-vector additions.
- `corepack pnpm --filter @subtrack/api lint`: exit 0.
- `corepack pnpm --filter @subtrack/api typecheck`: exit 0, including after final type assertions.
- `corepack pnpm --filter @subtrack/api test` with Git OpenSSL in PATH: 58 files, 1,188 tests passed. This full run preceded two compile-time negative assertions and the anonymous binding vector assertion; the focused suite and typecheck passed afterward.
- `git diff --check` on changed tracked source and contract: exit 0.

The assigned nongenerated source diff is 24 added/3 removed core lines, 1 added/1 removed contract line and 154 new test lines: 183 changed lines before this evidence file, below the 600-line cap. The branch also has unrelated existing dirty metadata and untracked coverage/security files; this handoff does not include or verify them.

## Final review correction

Independent security review and Conductor found that six type-negative specimens omitted required common fields and could pass for the wrong reason. Conductor added the valid canonicalRequestDigest/idempotencyKey fields to each specimen, preserving the targeted invalid operation/transport/purpose/authority. Final focused suite: 20/20 PASS; final API typecheck: PASS. Guard and contract unchanged; final test SHA-256 3B003ADA84B99677390282DE704BEDA6B82937881E021194E56E5F6F087C3B81. Security rereview APPROVE. Coverage QA applies to unchanged guard source. Full final regressions remain an exact-head CI gate.
