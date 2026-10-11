# ST-237 early TLS actual QA — frozen head C4

**Verdict: early TLS feasibility PASS at this frozen head.** This is independent QA of only the private HTTPS browser proof on PR [#282](https://github.com/achkum/Applied-AI-Projects/pull/282), head `c98745e4c42620fb08f831affeca818ee7b2515d`. It is not a full ST-237 source GO or enrollment/profile acceptance.

GitHub Actions [run 38142992330](https://github.com/achkum/Applied-AI-Projects/actions/runs/38142992330) was a successful `pull_request` run at that head. Frozen install, Firefox/NSS installation, real Next register-page build, direct TLS/browser proof, and receipt upload all succeeded. The uploaded sanitized `st237-private-https-receipt` (artifact 11703900970) contains, in order:

```
PASS ST237_TRUSTED_LOCALHOST_NEXT_NEST_TLS
PASS ST237_WRONG_HOSTNAME_REJECTED
PASS ST237_UNTRUSTED_CA_REJECTED
PASS ST237_EPHEMERAL_TLS_PROFILE_CUSTODY
PROOF PASS head=c98745e4c42620fb08f831affeca818ee7b2515d cleanup=removed
```

The reviewed frozen source makes these markers conditional on a real Firefox persistent profile with the task CA trusted, a 200 response from the built Next `/sv/register` page, and a same-origin browser POST whose Nest/Express controller asserts the original encrypted TLS socket, loopback peer, exact Host/Origin, and single raw Host/Origin headers. The wrong IP host must produce Firefox `SSL_ERROR_BAD_CERT_DOMAIN`; a separate clean profile must produce `SEC_ERROR_UNKNOWN_ISSUER`. The trusted healthy check repeats after each negative. The custody marker follows termination of owned browser/server process groups and removal/absence of the owned temporary directory. The workflow uploads only the sanitized receipt. These are the predicates this run establishes; it does not exercise the eventual enrollment/profile routes.

The receipt head equals the frozen commit. Independently computed Git blob IDs and SHA-256 values for its five declared inputs match all five receipt pins:

| Input | Git blob | SHA-256 |
| --- | --- | --- |
| `SubTrack/apps/web/test/private-https-preflight.mjs` | `411f1862ae4631a7c1f92610fd7e2a07b20d6ee3` | `7bc2a2b8ef6a177de74809128192f3f1ee5c81c230f799f99a8dbfaa2d0ae432` |
| `SubTrack/tools/browser/private-https-preflight.sh` | `6d1341daeff7904b40106a4d0035f6caa86940ec` | `7aff54ac9cdddfafcfb777b83268f3d33566bc2e57b8016624fc1b1959f3d25d` |
| `SubTrack/apps/web/package.json` | `8bc98676b3efe17c0a7b077556efa6530e0dfb95` | `0924e79a59bbbb427a5029037014d2b4ce531513866fc079339ccae037c90da2` |
| `SubTrack/pnpm-lock.yaml` | `46b02464c3df71e9d2b487a4e35daac758c55f9e` | `889e2677532cef9782a2583200d970be34a09876b31d11d14c54e7db75a4f92a` |
| `.github/workflows/subtrack-private-https-profile-proof.yml` | `c6d4fc9556f12ea71ee643aa8e90cb0f6f11609f` | `412b8b9c395ba7af494038efb54b9e29a89af79f825c51c3e871b728e4a75d0a` |

Runtime receipt: Ubuntu 24.04, Playwright 1.63.0, NSS `2:3.98-1ubuntu0.2`, Firefox `155.0`; workflow pins Node 22 and pnpm 12.6.0. No raw browser/server logs, certificates, keys, or profiles were inspected or exported in this review. This QA made no workflow dispatch, source, or Git mutations.
