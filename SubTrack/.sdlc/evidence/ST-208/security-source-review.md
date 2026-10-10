# ST-208 independent security source review

Verdict: **APPROVE** for the ST-208 core, test, and narrow contract change reviewed on 2026-10-10. This approval is bound to these SHA-256 source hashes:

| File | SHA-256 |
| --- | --- |
| `apps/api/src/auth/idempotency/idempotency-guard.ts` | `7C3BBCDB76905804DDF1ABF81C9D587DA0CE816AF406D5616840960BC6D90019` |
| `apps/api/src/auth/idempotency/anonymous-enrollment.spec.ts` | `3B003ADA84B99677390282DE704BEDA6B82937881E021194E56E5F6F087C3B81` |
| `docs/product/API_CONTRACT.md` | `28658D3CF1860BEEDB165D5485AC6E499BBA77CC31A0A74328150D1287AD9483` |

I read the repository instructions, Constitution, ST-208 task, accepted ADR-0020, prior ST-207 adoption evidence, the existing guard tests, and the assigned source and contract diff against main `157fad1`. I inspected existing guard callers for compatibility. This was an independent source review; I did not run tests, CI, network calls, or deployment. The author's recorded focused, lint, typecheck, and full API results are in `core-verification.md`; QA and exact-head CI remain separate gates.

The new anonymous digest has a separate type brand and wording and cannot be passed as a trusted authority type. Its reservation type requires mobile `startV2Otp` or `verifyV2Otp` with literal `enroll_identifier`. Both reserve and settle validate that tuple at runtime, including malformed or missing purpose and cast inputs. Existing authority kinds remain unchanged and reject any added purpose property. No principal, account, session, deletion, or mobile step-up authority is introduced.

The guard still keys caller-key uniqueness globally and burns pending, completed, and failed reservations. Settlement requires the original binding and owner handle; expiry and capacity remain unchanged. Anonymous binding appends a length-framed purpose after the five existing fields, preserving prior binding bytes. The tests cover literal old and new binding vectors, successful start and verify settlement, wrong owner and binding, cross-kind duplicates, failure burns, replay rejection, and TTL/capacity. I identified vacuous type-negative specimens during review because they omitted the required common fields; the final test hash above includes the correction, so each negative now isolates its intended discriminator.

The contract adds only the adopted anonymous mobile enrollment exception and states that its digest establishes no identity. It leaves the wire envelopes and mandatory BankID model untouched. No blocker or major security finding remains in this assigned diff. This approval covers the core/contract source only; the future digest producer, metadata coherence, HTTPS adapter, and deployment require their separate reviews.
