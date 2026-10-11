# ST-237 independent feature/security source review — C12

**Source verdict: APPROVE the frozen C12 pin correction; actual feature/security acceptance HOLD.** I reviewed head `d0bb744573c0a65181fcdb7aec5dc96bd6663440` against C11 `fb5d6a98f78fff2a9769577391868402cef16250`, the ST-237 task and previous security source reviews. The executable diff changes only four SHA-256 literals in `apps/web/private-https-server.mjs`; no SQL, schema, role, grant, proof topology, browser, HTTP, or current-authority behavior changed. I did not author source, alter Git, or run PostgreSQL, Docker, Firefox, CI or actual QA. The original L240 start `2026-10-11T12:53:20.061Z`, deadline `16:53:20.061Z`, attempt/source counters and caps remain in force.

I independently extracted the ten qualified SQL pins and privacy migration pin from the **frozen C12 launcher blob**, then SHA-256 hashed each corresponding **raw `git show d0bb744:SubTrack/...` blob byte stream**, without using Windows working-copy bytes. Every pin matches:

| Frozen file | Git-blob SHA-256 |
| --- | --- |
| SQL001 `001-epoch-nonce-reservation.sql` | `7ada99f0863aca74e8f6e25e3e990e796e619c2118f138b8f1c2daa867c82bd2` |
| SQL002 `002-epoch-fence.sql` | `1fa14fd1e0e487806550b74280d94f94de245fe231d7e34c4a5f7c70ddf104d9` |
| SQL003 `003-nonce-binding-lookup.sql` | `94239213cefab43db0fd2b339361331c1de6ac6d94aa6e4885d532c2cc3076b9` |
| SQL004 `004-bootstrap-reservation.sql` | `eda3b86bd75161c2c617c1c2e02ee293e00077c31eb60b473e0d7a1062bcf0bf` |
| SQL005 `005-expired-reservation-prune.sql` | `d76d2297e4f146603f9cbcf3732e497746214aa2c8e5936afeebaa6d4ce68354` |
| SQL006 `006-owned-bootstrap-settlement.sql` | `8c6313958d52a91f883d9a875840fbc7656adcad8b3326fa1e24da11e6692d85` |
| SQL007 `007-expired-nonce-prune.sql` | `6ff9c97d3c8ed80735ca59cb41a581eb894b16ac33a704ddae9db262d5ed4baa` |
| SQL008 `008-atomic-bootstrap-nonce-issue.sql` | `d49635b5303fc9405f8ab1b5609859a9dca7129b8a7f36f41a29453cf2ea4d62` |
| SQL009 `009-current-web-session-csrf.sql` | `f7c026ee9dac458bbfbbea13e1774d3bd392fdab8e5c4659185dc769ecab2c9b` |
| SQL010 `010-enrollment-account.sql` | `954be5c4ae1c018aac161a5ec7e59d2bd1bc478df5310a7a15f968f8bfd90a4a` |
| Privacy `0002_privacy_constraints/migration.sql` | `b2ef9ebbdce9f9dddff9f43b6679e0fdac58324c2a6ef060af33662ec89a2f9a` |

The earlier C9 security source note said the SQL pins matched, but that check used working files and was insufficient for Linux checkout bytes. C11's actual four browser-matrix jobs reached startup SOURCE and failed before browser execution; this C12 correction fixes that exact static mismatch in source, with no normalization or bypass added. The C11 approved single-network custody and runtime-role startup qualification, and the broader private enrollment-to-profile security boundary, carry unchanged. `git diff --check fb5d6a9 d0bb744` passed.

Actual acceptance still requires a fresh exact-head C12 full PG16/natural Firefox sv/en × light/dark matrix through source/catalog/epoch startup, enrollment, known-committed cookies, owner PATCH and distinct POST read, partial-cookie safe stop, negatives, source/build finish pins and removed custody. Require the separate changed-head ST-233a qualified foundation proof, applicable CI and independent actual QA. Earlier C10 old-fixture PASS receipts do not substitute for changed-head execution. No production/provider/public release or merge approval follows from this source decision.
