# ST-208 independent platform source review

Verdict: **APPROVE** for the final ST-208 idempotency core, anonymous enrollment tests, and narrow API contract change reviewed on 2026-10-10. This verdict is bound to the following SHA-256 hashes:

| File | SHA-256 |
| --- | --- |
| `apps/api/src/auth/idempotency/idempotency-guard.ts` | `7C3BBCDB76905804DDF1ABF81C9D587DA0CE816AF406D5616840960BC6D90019` |
| `apps/api/src/auth/idempotency/anonymous-enrollment.spec.ts` | `3B003ADA84B99677390282DE704BEDA6B82937881E021194E56E5F6F087C3B81` |
| `docs/product/API_CONTRACT.md` | `28658D3CF1860BEEDB165D5485AC6E499BBA77CC31A0A74328150D1287AD9483` |

I reviewed the repository instructions, Constitution, decision and quality gates, ST-208, accepted ADR-0010 and ADR-0020, ST-207 adoption evidence, the guard and existing tests, current callers, and the assigned source/contract diff. This was an independent source review; I did not edit implementation, run tests or CI, make network calls, or change the branch.

`AnonymousRequestDigest` has its own brand and explicit request-isolation wording. `AnonymousEnrollmentReservationInput` requires the anonymous kind, literal `enroll_identifier` purpose, mobile transport, and only `startV2Otp` or `verifyV2Otp`. Both reserve and settle validate that tuple at runtime, including missing, malformed, and cast inputs. Existing browser-chain, verified-principal, and browser-bootstrap-origin authority meanings remain intact; their branches now reject an extra purpose property, including `undefined`. The examined OTP, deletion OTP, and session callers construct existing trusted inputs without that property. The anonymous digest supplies no identity or principal authority.

The guard retains one global keyed caller-key map across all kinds, so pending, completed, and failed reservations burn the key across kinds. Settlement still requires the pending record's original binding and owner handle. The anonymous binding appends a length-framed purpose to the existing five framed fields; the prior five-field sequence and domain remain byte-for-byte unchanged. Literal test vectors cover all three prior authority kinds and the new branch. The final tests also cover start and verify settlement, type negatives with valid common fields, invalid tuples in reserve and settle, cross-kind burns, wrong owner/binding, completion and failure replay rejection, TTL, and capacity. There is no change to the configured key, retention limits, or failure text.

The API contract changes only the every-mutating-POST authority statement for anonymous mobile enrollment start and verify. It explicitly denies principal/account authority and anonymous mobile `otp_step_up`; existing wire envelopes, mandatory BankID, account/session/deletion controls, and the existing browser nonce bootstrap behavior remain outside this change. The diff adds no endpoint, default registration, anonymous digest producer, OTP key, provider, or deployment wiring. The later metadata/producer coherence and development-only HTTPS adapter gates in ADR-0020 still require separate implementation and review.

The author's handoff records focused tests, lint, typecheck, and an earlier full API run of 1,188 passing tests. Independent QA reports 20 focused tests passing and changed guard coverage of 98.41% lines and 98.78% branches. Security independently approved these same final hashes after the type-negative specimens were corrected. Exact-head CI and Conductor integration remain separate required gates. No blocker or major platform finding remains in this reviewed scope.
