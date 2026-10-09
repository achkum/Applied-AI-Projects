# ST-203 security final test delta review

**Disposition: APPROVE_SOURCE_FINAL.** This is a narrow review of the two fixture-expression changes made after the existing full source security approval. It does not replace or expand that prior approval. The prior approval's runtime-source review remains unchanged and valid: both runtime files retain their approved hashes. The complete final frozen file set is recorded below.

## Reviewed delta

Read-only `git diff` shows exactly two one-line changes across the two approved specs:

- Unit spec settlement-failure idempotency key: `[previous synthetic unit key]` → `'s'.repeat(32)`.
- HTTPS wire helper default `Idempotency-Key`: `[previous synthetic HTTPS key]` → `'w'.repeat(32)`.

Both generated values are 32 printable ASCII characters. The unchanged runtime validator accepts exactly one printable ASCII `Idempotency-Key` of 16–255 characters, so both fixtures remain valid. The unit case still exercises settlement failure and non-replay behavior; the HTTPS cases continue to exercise real request parsing and proof behavior. The diff contains no other changed lines. There is no source change, scanner ignore/suppression, test removal, assertion weakening, or modification to request body, principal binding, replay, parser, or runtime control flow.

The unchanged suite still contains the required idempotency/replay and principal-bound proof checks, strict body and Bearer handling, negative transport cases, and actual HTTPS verification flows. The root owner reported 33 focused checks and 1105 full API checks passing before these fixture-only edits; the 33 focused checks are to be rerun by the root owner after the edits. I did not run tests or builds.

## Final frozen file identity

| Actual file | Before fixture delta | Final actual | Result |
|---|---|---|---|
| `apps/api/src/auth/proofs-v2/mobile-deletion-otp-verify-http.ts` | `9c025f722f9b771776c7d06eafac36bdfe414b4c0ac82d412b30a9b6c6872028` | `9c025f722f9b771776c7d06eafac36bdfe414b4c0ac82d412b30a9b6c6872028` | Unchanged; prior runtime approval remains applicable |
| `apps/api/src/auth/proofs-v2/mobile-deletion-otp-verify-http.module.ts` | `df2878b9748e9349f7d17c02fc3205cbea22146dd02ee1d1a3e600d5c240b3f5` | `df2878b9748e9349f7d17c02fc3205cbea22146dd02ee1d1a3e600d5c240b3f5` | Unchanged; prior runtime approval remains applicable |
| `apps/api/src/auth/proofs-v2/mobile-deletion-otp-verify-http.spec.ts` | `ca0413d249a60a55fd2111a52ef0e2a3be36dcbb7550298f35b50b0d36484f61` | `e28b7fc7b3ff5fbc7500f0fc3774d6ae9ebbb96b7af267e2454bf802e7663021` | Expected fixture-only delta reviewed |
| `apps/api/test/mobile-deletion-otp-verify-http.spec.ts` | `41f7f8595d3648c051088d244b5ea0970badf9ce58d16f77f3a003fc3f8dad92` | `246a57a9e346b530a5ab3356349ac61ac7f432e1e8958313a09883c018c25567` | Expected fixture-only delta reviewed |

No blocking security finding arises from these two synthetic fixture substitutions. This approval is limited to source-level security review of the exact final file hashes above; focused rerun, full API/CI gates, and any required exact-head reviews remain with the root owner.

Conductor note: the two historical synthetic fixture literal values in this tracked copy are described rather than repeated because generic-key scanning flags a historical quoted literal. The unmodified independent report is retained in /workspace/.setup/ST203-security-final-test-delta-review.md. Disposition, source hashes, findings and limitations are unchanged.
