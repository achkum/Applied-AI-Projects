# ST-239 C6 verify-stage diagnostic author checkpoint

C5 base HEAD: f915e34cbe9cfc5e4eb68ad9aaddd3e3f916bb32. Original L240 attempt 1/source 1 deadline 2026-10-11T22:18:06.654Z and counters retained. Author edits remain uncommitted and unstaged. This is source authoring, not runtime-cause proof or acceptance.

Implemented invocation-local closed stages INPUT/PEEK/RESERVE/VERIFIER/SUBJECT_LOOKUP/ISSUE/COMPLETE and closed outcomes REJECT/RETURN_FALSE/ROLLED_BACK/UNKNOWN_TX/UNKNOWN_COMMIT. Transaction failure callback is scoped to this verify invocation; unknown before COMMIT is distinct from attempted unknown commit. SQLSTATE output is only NONE/PRIVILEGE_42501/FK_23503/CHECK_23514/DIVZERO_22012/OTHER. DIVZERO_22012 is not an expiry conclusion. Private marker writer is nonthrowing. Existing masked failure, rollback, burn and no-replay behavior remain. Shell exports one exact anchored last marker only for the stopped first-Bob verify=409 failure shape.

Focused validation: durable-development-login.spec.ts 13/13 passed; API TypeScript noEmit passed; focused ESLint passed; Bash syntax passed; scoped git diff --check passed. No qualified PG/browser proof or independent exact-source review has run on these edits.

Source hashes:
- SubTrack/apps/api/src/auth/login-v2/durable-development-login.ts raw=91dbbc799c951c5b6477bd49777cc37e1ec7c22d4ab7faca64d32e8c0405180d LF=91dbbc799c951c5b6477bd49777cc37e1ec7c22d4ab7faca64d32e8c0405180d
- SubTrack/apps/api/src/auth/login-v2/durable-development-login.spec.ts raw=94b620ce0996a3ea75ad16b33795ebb77ff4073b9b335f6b28735d72d3d35b34 LF=94b620ce0996a3ea75ad16b33795ebb77ff4073b9b335f6b28735d72d3d35b34
- SubTrack/tools/database/private-profile-proof.sh raw=b4e2a27afa5c45489c22bcebbac5ac625082cb79ceae77684d53d7db117e01bb LF=f2401576a6c911319c0df2802aef02cec63719a28649b9f43d9bb12b74606aec

Guard report: approximately 20 author tool calls total across the resumed context, with one failed provisional test run (3 new tests lacked valid verifier fixture) corrected and 13/13 final focused tests passing. No stage or commit.
