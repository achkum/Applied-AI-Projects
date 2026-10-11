# ST-239 independent QA proof-source review C2

2026-10-11. Accepted base `85f8134b9fd2a79ab572825766a7928171c9801e`; original source attempt 1 and 18:18:06.654Z–22:18:06.654Z deadline unchanged. I reviewed the C1 findings, both correction checkpoints, and current proof source without editing product source, Git state, or runtime data. **Verdict: APPROVE static proof-source readiness for qualified execution.** Actual PG16, private HTTPS browser, four-variant screenshots/pixels, cleanup, exact-head custody, and applicable CI remain outstanding; this is not actual QA approval.

The browser's `PASS ST237_BROWSER_CASE case=login` is emitted only after the natural Alice/Bob flows, lost-session recovery, final 50-item list, screenshot, and awaited `assertSafeWire()`. The three exact ST239 browser markers immediately precede it. The shell requires all four exact lines before its database phase. The retained five accepted cases (`profile`, `partial-terminal`, `empty`, `subscriptions`, `uncertainty`) and added `login` case are iterated for each sv/en × light/dark workflow variant. Cleanup retains bounded process/container/network removal and source/bundle rechecks.

The natural Bob browser flow writes `CONTACT_SNAPSHOT_READY` after enrollment and authoritative incomplete-profile/absent-mode reads, before fresh Bob login; it waits for `CONTACT_SNAPSHOT_CAPTURED`. The shell verifies three identities (natural Alice, natural Bob, foreign fixture), privately hashes canonical JSON of every `public.identity` row, releases the browser, and compares the entire table after browser login and before the separate PG integration mutates Bob's fixture subject. Contact values and digests remain in owned temporary files and are not exported. This tests natural identity-row nonmutation across the browser login path, including contact fields, without substituting a seeded main owner.

The PG integration temporarily replaces natural Bob's persisted `external_id` with an unrelated digest, invokes the same trusted Bob verification, requires the generic restart error and unchanged session/credential/CSRF/proof counts, and restores the subject in `finally` with a checked row count. It then expires a bound login proof while the terminal nonce remains live and requires failed redemption with unchanged counts; it separately expires the nonce, retries with a fresh key, checks failed redemption and retained rows, then proves prune/cascade. The shell requires both new exact PG markers. Existing one-use, race, rollback, deleted-owner, binding/Origin, unknown-commit, role, catalog, startup-refusal, and cleanup gates remain in source.

The reusable browser response observer is attached to the initial and every replacement page. It checks `Cache-Control: no-store`, `Pragma: no-cache`, Secure/HttpOnly/SameSite=Lax/no-Domain cookie attributes, and absence of verifier `Set-Cookie`; intercepted and deliberately lost responses are checked directly. Pending response checks are awaited by `assertSafeWire()` before the final login PASS marker. Volatile CSRF is not printed.

Diagnostic limitation for hosted execution: the shell requires the ST239 browser marker lines but its sanitized receipt exports only `^PASS ST237_BROWSER_`, and its closed FAIL export regex excludes `case=login` and new login phases. A passing generic login case still entails the exact ST239 marker gates under the source/head custody check; a failing run may expose only `phase=BROWSER`. A narrow whitelist for those marker names and login failure phases would improve diagnosis without exposing raw logs. This does not block static source readiness.

Static checks independently run: `node --check apps/web/test/private-profile-browser.mjs` PASS; Git Bash `bash -n tools/database/private-profile-proof.sh` PASS. No heavy tests or runtime proof were run in this review.

## SHA-256 of reviewed source

| File | SHA-256 |
| --- | --- |
| `apps/web/test/private-profile-browser.mjs` | `44acec1fdcda1fb1cde6e77ff7cc53d1ae0c6b1ee153a56981400c8f5cea2015` |
| `tools/database/private-profile-proof.sh` | `4320e6b6fe4213d9bbcaf1adca380cc4cf6d13f224eadbd11a7f695c8c553eda` |
| `apps/api/test/durable-development-login.integration.ts` | `6f43408112182dc1c60926ab5575697d42f712db6c787353e783abad4a6e4760` |
| `.sdlc/evidence/ST-239/browser-proof-correction-checkpoint.md` | `ddfb7150888bb27620712d7b2f3f95b261e8f275fc80bc681c0f8b1c20117f78` |
| `.sdlc/evidence/ST-239/pg-proof-correction-checkpoint.md` | `87a8cf9f659b2f533ed33ed59e065f2c688c4df86a97a8e27d101e3b86a4629a` |

These are working-tree byte hashes, not a committed head or runtime receipt. The C1 hashes are superseded for the three changed proof files.
