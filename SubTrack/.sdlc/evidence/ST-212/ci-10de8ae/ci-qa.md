contract: REVIEW/v1; task_id: ST-212; reviewer: qa-engineer; verdict: PASS_ACTUAL_PG_PROOF
PR240 head: 10de8aee2ed00ddebadda8dd168daafcbee30c82; dedicated run 38069286873 completed success at that exact head.
Artifact st212-subscription-read-proof-96ef06f2a96495235f11eeb2e38f1809153a73e8 matches PR240 merge_commit_sha 96ef06f2a96495235f11eeb2e38f1809153a73e8.
Downloaded sanitized receipt: `ST-212 disposable PostgreSQL proof: PASS receipt=integration-wrapper`.
Run steps report full migration and HTTP proof success, recorded-container cleanup success, and artifact upload success.
Source test asserts nonowner LOGIN/non-superuser/non-BYPASSRLS runtime role, RLS and grants, and empty principal GUCs on pooled connection before and after HTTP calls.
It exercises actual guard/resolver/current-session reader, scoped repository and HTTP owner/peer/outsider list, detail and review inbox.
Assertions cover explicit share and open_book visibility, always_private and DETECTED exclusion, peer-safe projection, signed >safe-integer amount strings, hidden/missing 404 equivalence.
Assertions also cover keyset order and cursor bounds/binding, share/consent/member revocation, spoofed identity and revoked session rejection.
The wrapper PASS indicates the single Vitest integration test returned success; it does not report a separate assertion count.
No QA code/test edits. Parent PR237 acceptance and unrelated Vercel red remain outside this PostgreSQL verdict.
