# ST-237 early TLS actual QA — frozen head C3

**Verdict: FAIL; no full-feature source GO from this run.** Independent review of only the early TLS feasibility proof on PR [#282](https://github.com/achkum/Applied-AI-Projects/pull/282), frozen head `2392a64947905312a2c4968a6b570d5568e3fa1f`.

GitHub Actions [run 38142826302](https://github.com/achkum/Applied-AI-Projects/actions/runs/38142826302) was a `pull_request` run at that head. Frozen install, Firefox/NSS installation, and the real Next register-page build succeeded. The direct TLS/browser step failed. The uploaded sanitized `st237-private-https-receipt` (artifact 11702684013) reports `DIAG ST237_BROWSER phase=TRUSTED_RESPONSE class=HTTP_304`, followed by `FAIL ST237_BROWSER cleanup=removed`. The proof requires HTTP 200 for the initial trusted Next register-page navigation and did not emit its trusted Next→Nest TLS PASS marker. It emitted no wrong-hostname, untrusted-CA, custody PASS, or final proof PASS marker. The diagnostic establishes the response-status mismatch, not why the response was 304. No raw browser or server diagnostics were inspected.

The receipt head equals the frozen commit. Independently computed Git blob IDs and SHA-256 values for its five declared inputs match all five receipt pins:

| Input | Git blob | SHA-256 |
| --- | --- | --- |
| `SubTrack/apps/web/test/private-https-preflight.mjs` | `f1b5bce64700bdf94883ad54767af01151feccf4` | `95f22ef33934f22b2d67f8baf2a88cad1acd60a356d1710462b8785779502681` |
| `SubTrack/tools/browser/private-https-preflight.sh` | `6d1341daeff7904b40106a4d0035f6caa86940ec` | `7aff54ac9cdddfafcfb777b83268f3d33566bc2e57b8016624fc1b1959f3d25d` |
| `SubTrack/apps/web/package.json` | `8bc98676b3efe17c0a7b077556efa6530e0dfb95` | `0924e79a59bbbb427a5029037014d2b4ce531513866fc079339ccae037c90da2` |
| `SubTrack/pnpm-lock.yaml` | `46b02464c3df71e9d2b487a4e35daac758c55f9e` | `889e2677532cef9782a2583200d970be34a09876b31d11d14c54e7db75a4f92a` |
| `.github/workflows/subtrack-private-https-profile-proof.yml` | `c6d4fc9556f12ea71ee643aa8e90cb0f6f11609f` | `412b8b9c395ba7af494038efb54b9e29a89af79f825c51c3e871b728e4a75d0a` |

Runtime receipt: Ubuntu 24.04, Playwright 1.63.0, NSS `2:3.98-1ubuntu0.2`, Firefox `155.0`; workflow pins Node 22 and pnpm 12.6.0. The fixed `cleanup=removed` marker gives limited task-owned directory cleanup evidence on this failed run, not the successful custody proof. A corrected exact-head actual run must establish trusted localhost Next→Nest TLS, both specific TLS negatives, and custody PASS before this feasibility gate can pass. This QA made no workflow dispatch, source, or Git mutations.
