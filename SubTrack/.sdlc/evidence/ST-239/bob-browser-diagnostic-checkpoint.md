# ST-239 Bob browser diagnostic checkpoint

2026-10-11. Diagnostic source only; C1 actual QA remains **HOLD**. The frozen C1 receipts at head `51bfc1882d5ffb2508776fa0d50a6021c5dfa274` show the five preceding browser cases passing in each locale/theme variant, followed by `case=login phase=BOB_NATURAL_ENROLLMENT` in all four variants. The first failing Bob action or assertion remains unknown; `CONTACT_SNAPSHOT_READY` was not reached. Independent QA agrees that the public receipt does not establish a product or database cause.

In `apps/web/test/private-profile-browser.mjs`, the broad Bob phase was replaced with 13 closed phases immediately before navigation, identifier fill/submit, OTP fill/submit, fixture selection, simulator click, editor wait, CSRF wait/assertion, profile fetch/assertions, and mode fetch/assertions. The browser actions, order, waits, inputs, assertions, and catch output fields are unchanged. No identity/contact, cookie, token, response body, or raw exception is added to public output. In `tools/database/private-profile-proof.sh`, both existing failure exporters allow these exact 13 labels while retaining the prior phase and field allowlists and all existing PASS gates. No runtime cause is assumed or fixed.

Checks: `node --check apps/web/test/private-profile-browser.mjs` PASS; Git Bash `bash -n tools/database/private-profile-proof.sh` PASS; `git diff --check` PASS. The change is 13 phase assignments and two allowlist substitutions across two source files. No actual browser rerun was performed here; the next actual proof must distinguish the first failed Bob step before any runtime correction.

SHA-256 after checks:

- `apps/web/test/private-profile-browser.mjs`: `994f789ba1fa2ac0afad3330ef581b47a1193de04c39a95e95c413c13e4dca54`
- `tools/database/private-profile-proof.sh`: `de2c0ec60832a41ff933620abf23ae5a8b925759abb6fd64d6b68b7bb8da39dc`

Author scope: no Git commit or push; PG lint correction remains outside this diagnostic edit. Source GO is limited to diagnostics preserving predicate execution. Original L240 source1 clock and counters continue unchanged.
