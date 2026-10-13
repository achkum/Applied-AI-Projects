# ST-239 launcher correction checkpoint

2026-10-11 source1, attempt1. Original clock remains 18:18:06.654Z–22:18:06.654Z. Storage author calls: prior approximately 20 + 18, this narrow correction approximately 12 calls; cumulative approximately 50. STOP8/14 observed; no source or clock reset.

The private TLS dispatcher now selects the login problem map for wrong methods on exactly `/v2/auth/login/simulator/verify` and `/v2/auth/session`. This uses the API author's exported `privateLoginProblem` and yields `400 INVALID_LOGIN_REQUEST`. Other enrollment, profile, mode, subscription, unknown-path, Host and TLS dispatch remains as before. The closed login map retains `404 LOGIN_UNAVAILABLE` for disabled login handling; no default route was enabled.

The private proof shell now probes both login wrong methods, an existing enrollment wrong method, and a nearby unmatched path. It checks problem+json/no-store shape and no Set-Cookie, then requires zero reservation, nonce and login-proof rows before browser work. This proves the dispatcher fails before authentication side effects when run on qualified PG16/TLS. A `PASS ST239_LOGIN_LAUNCHER_METHOD_MATRIX_NO_AUTH_SIDE_EFFECTS` receipt is required.

Static checks passed: `node --check` on the launcher; `git diff --check` on launcher and shell; esbuild 0.28.2 via Vite's transitive installation parsed the new PG integration and login HTTP source. Windows has no Bash command here; no shell execution, PostgreSQL, browser, source-bundle startup or CI result is claimed. Root owns the next API build and qualified proof run. The API author exported `privateLoginProblem` in the new private HTTP module and was asked to cover its 404 mapping in focused tests.
