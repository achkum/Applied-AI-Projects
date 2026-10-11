# ST-239 narrow API correction checkpoint

2026-10-11T21:01Z. Same source1 attempt, original 2026-10-11T18:18:06.654Z–22:18:06.654Z deadline. Prior API author count approximately 69 calls; this narrow continuation used approximately 13 tool calls, approximately 82 cumulative. No source gate or counter reset.

Fixed platform source review C1 major finding in `apps/api/src/auth/login-v2/durable-development-login.ts`: `requestH` now HMACs the closed operation plus validated strict body values, resolved browser chain, canonical SHA-256 nonce digest and canonical SHA-256 binding-cookie digest. The existing `h()` length-frames each UTF-8 field as byte-length, colon, value, in that exact order. SQL signature, privilege model and reservation behavior did not change. Added a boundary-level unit that observes the reserved request digest and changes the strict body, chain, nonce and cookie individually; all four produce a different digest.

For the launcher owner's C1 minor correction, `apps/api/src/auth/login-v2/private-login-http.ts` exports `privateLoginProblem(response,status)` using its existing login problem map. Adjacent HTTP unit verifies exact 400 `INVALID_LOGIN_REQUEST` and 404 `LOGIN_UNAVAILABLE` mapping without cookies. The launcher owner is updating the route to call this export.

After final source/test edits, focused V8 coverage run passed **21/21** in two files. Measured combined login source coverage: statements **90.9% (220/242)**, branches **85.04% (182/214)**, functions **100% (33/33)**, lines **97.23% (176/181)**. Per-file statement/branch: durable login **91.83%/85.2%**, private login HTTP **86.95%/84.44%**. `corepack pnpm exec tsc --noEmit -p tsconfig.json` passed; `git diff --check` on these four source/test files passed. No full API build or PG/browser proof by this author.

SHA-256 final inspected files:

| File | SHA-256 |
| --- | --- |
| `apps/api/src/auth/login-v2/durable-development-login.ts` | `c265450c785884553d0790f00d0a4607f497789e64d205326cff553e941c2b3a` |
| `apps/api/src/auth/login-v2/durable-development-login.spec.ts` | `e4c40c89e6e298de585beb17275b5c07418b2f6680a3d3f8eb070660520d92e4` |
| `apps/api/src/auth/login-v2/private-login-http.ts` | `f2bfc7b6ee1d4e5260678c41108b6fc2280abdb52b17a31a1c17f0e14f611f27` |
| `apps/api/src/auth/login-v2/private-login-http.spec.ts` | `6bf94d7dff0e182083ac9c0453d58932e6813eb8eef66a8082e50428d8d15083` |

The coverage reporter created untracked `apps/api/coverage/`; shell deletion was blocked by tool policy. Conductor should remove that generated directory before source custody/commit. This checkpoint is author evidence, not independent source/security/QA approval.
