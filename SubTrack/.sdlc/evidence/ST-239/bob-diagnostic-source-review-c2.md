# ST-239 Bob diagnostic source review C2

2026-10-11. Independent review of the post-C1 diagnostic delta against exact frozen head `51bfc1882d5ffb2508776fa0d50a6021c5dfa274`. **APPROVE these diagnostic source bytes for C2 push and CI progression only.** C1 actual QA remains HOLD; this review is neither a runtime root-cause finding nor acceptance of Bob login or the contact-row proof.

The two-file delta is confined to `apps/web/test/private-profile-browser.mjs` and `tools/database/private-profile-proof.sh`. The browser replaces the broad `BOB_NATURAL_ENROLLMENT` phase with 13 closed phases immediately before Bob register navigation, identifier fill/submit, OTP fill/submit, fixture selection, simulator click, editor wait, CSRF wait/assertion, profile fetch/assertions, and mode fetch/assertions. The original browser calls, input generation, selectors, `50 × 100 ms` CSRF wait, 200/status and body assertions, `CONTACT_SNAPSHOT_BARRIER`, and catch output fields are unchanged. No extra product call or response handling was introduced. The shell adds only those 13 literal phase labels to each of its two already anchored failure-export regexes. Existing field enums, negative-gate branch, PASS gates, snapshot handshake, cleanup, and private log handling are unchanged. No contact value, identifier, cookie, token, body, or raw exception is printed by the new source.

The author did not add a synthetic failure PNG. That is not a source gate here: the new closed phase label will narrow the first failed operation/assertion while preserving the established screenshot behavior. The next actual C2 receipt is required to identify which phase fails. It must not be treated as evidence of a particular product cause until observed.

Independent `node --check` and Git Bash `bash -n` returned 0; `git diff --check` reported no patch whitespace error. Read-only SHA-256 of reviewed checkout bytes:

- Browser driver: `994f789ba1fa2ac0afad3330ef581b47a1193de04c39a95e95c413c13e4dca54`
- Proof shell: `de2c0ec60832a41ff933620abf23ae5a8b925759abb6fd64d6b68b7bb8da39dc`

The unrelated uncommitted PG17 lint correction was not part of this review. No browser, database, CI, commit, or push was performed by this reviewer. Original L240 source1 clock and budget remain unchanged.

Post-commit custody carry: exact committed head `79f9dd37bf9ebfa6d0b6a70999193e8113a4b87a` contains the reviewed two-file source after CRLF-to-LF normalization only. `git show HEAD:` bytes versus reviewed checkout bytes match after replacing CRLF with LF; the checkout had 847/531 CRLF sequences respectively and committed files have zero. Committed SHA-256 is `8258063978f58e071cc7af95ea6876eb02d034862c7d21358422a0868eb7eadb` for the browser driver and `bdc526c25b76d36103bf6103bc0afcd811c18fbb98ba2959552940629cb04b25` for the proof shell. Both tracked paths are clean. **Source APPROVE carries to this exact commit for push/CI only.** The PG17 correction in the commit remains under its separate platform review.
