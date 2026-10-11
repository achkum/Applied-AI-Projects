# C10 harness diagnostics author receipt

Scope: `development-auth-foundation-proof.sh` and `test-development-auth-foundation-proof.sh` only. The enrollment driver nonzero-exit path reads the already private `driver-failure.log` for one whole `ST-236 enrollment diagnostic:` line. The parser accepts only the agreed fixed step and query labels and an uppercase five-character SQLSTATE or `unavailable`. Missing, duplicate, malformed, or unapproved content yields three `unavailable` fields. The existing checkpoint line remains unchanged. The enrollment FAIL receipt appends `node_step`, `node_query`, and `node_sqlstate` after `checkpoint`; the foundation scope and PASS receipts remain unchanged.

Verification: Git Bash syntax checks passed for both shell files; `git diff --check` passed. The Windows harness ran the new parser fixtures and real `finish` receipt cases, including valid, missing, duplicate, unknown, invalid SQLSTATE, malicious sentinel, and malformed writer variables. It then stopped in later existing tests because this Windows environment has no `python` command (`Python was not found`); this is not a full Linux test or actual PG16 proof. No source commit or push was made.

ST-236 original 09:44:30.897Z start, 13:44:30.897Z deadline, attempt 1/source 1, author 4700/full PR 5000 caps, and prior C1–C9 failure history remain in force.
