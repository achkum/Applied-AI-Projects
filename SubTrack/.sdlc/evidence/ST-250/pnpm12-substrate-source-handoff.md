# ST250 coherent pnpm12 launcher source handoff

2026-10-14. All21 frozen primary paths implemented after root-confirmed SDK54 merge ce9f3a3; native-device workflow's maintained macos15/Xcode26.2/iOS26.2 and private proof gates preserved. SDK unsigned workflow remains its separate author's stream. No Git/push, package reinstall, hosted dispatch, SQL/VPS action, authority/gate or dependency-version change by this author.

Ten existing workflows/twelve jobs now explicitly npm-install pinned pnpm12.6.0 after Node setup, assert exact version and use direct pnpm for unchanged install/build/check steps. Existing API build/typecheck/test scripts switch only explicit Corepack prefixes, preserving step order. Nine existing shell files switch only launch prefixes and the aligned existing launcher-negative stub; changed shell files normalized to LF so actual Bash execution matches Linux. No unrelated source normalization.

API dependencies/devDependencies JSON objects were compared before/after the edit in the author process and match exactly. Lock SHA `546dbd9d7a74e6848d9b82f81c3f68768ccc8ef3f6c650cc601e90076e1b4656` was unchanged before SDK integration; current merged lock SHA is `0fb22b043419838d8cc1b6be7b338763794d674376be5d480da54efe092e53c7`, changed solely by root's reviewed SDK54 merge, never rewritten by this launcher author. Current Node versions, workflow triggers/permissions/timeouts, lock flags, licence/quality gates, private URL quoting, deadlines, custody, diagnostics and assertions remain. Existing direct/action-setup CI and Dockerfiles are untouched.

Granted one exclusive short validation slot: actual YAML2.9.1 parses allten workflows; assertions verify ordered Node→pinned installer/exact version→frozen dependencies across12jobs and read-only permissions/no explicit Corepack remainder. API JSON assertions verify direct nested launchers. Allnine Bash syntax checks PASS. Actual existing test-browser-subscription-lifecycle-launcher-proof.sh passes both ST226 finish/diagnostic negatives and ST227a actual runner/absent mandatory gate negatives with the renamed pnpm stub. No unchanged application suite repeated. Heavy slot released after this batch.

Final native-only check after SDK merge: actual YAML parser verifies pinned installer/exact version/frozen install/no Corepack plus preserved private proof/localhost authority gates and exact maintained macos15/Xcode26.2/iOS26.2. PASS. No repeated heavy/native suite. Independent source review and actual new-head applicable CI remain required; no source gate is waived because earlier launchers failed before install.

## Exact21-file source roster

| Git-root-relative path | SHA256 |
| --- | --- |
| `.github/workflows/subtrack-private-mobile-proof.yml` | `b5709ab3f700852ba1098978c2e8d772035062185cfcd598737438aa33f9a60b` |
| `.github/workflows/subtrack-browser-subscription-read-proof.yml` | `0a8f6bdf4b0ba6ecf750facf5e9c202bff4e88400584b10996c36084035b1bd6` |
| `.github/workflows/subtrack-clean-migration-proof.yml` | `38703cda541d1b480ac504aff2dd7193c9cf08a42f4dd26bc1d22930893d39a2` |
| `.github/workflows/subtrack-browser-subscription-lifecycle-launcher-proof.yml` | `b6fabf2bbe1a5f1867df92c15b6e86084128eae7d6b640e17aedcbc4e9386be2` |
| `.github/workflows/subtrack-session-owner-proof.yml` | `da2b782f0fface8fba545ee2aa8aa45dbeed685d520aac8ea304f08657b6c0fc` |
| `.github/workflows/subtrack-development-auth-foundation-proof.yml` | `5e7ce8a4a3c029ca95e22b6cadda8acc976784811449496e039245a29cc4f7a5` |
| `.github/workflows/subtrack-subscription-read-proof.yml` | `9c6b178497f23e2e627990b4cbfd6dfe2575b09e6c2690f3acfe98f9473c0642` |
| `.github/workflows/subtrack-subscription-lifecycle-http-proof.yml` | `c15022b4821ead0172be93ef338afcf2334d04b307d5adb0732be6fad289a6c7` |
| `.github/workflows/subtrack-subscription-lifecycle-proof.yml` | `8488bde2940c94fe24c45b067cc7c7acb0a288eab7e82e0f6cdc95e706af1cac` |
| `.github/workflows/subtrack-private-https-profile-proof.yml` | `7d4c77e85c8153159bff18570550c3c6d07abb7a4f84a77203b0ba99c96a5f9e` |
| `SubTrack/apps/api/package.json` | `5b49113b09c48e8378e543a5fba17ff73c81abf053beaa62a413085ae1a00195` |
| `SubTrack/tools/browser/private-https-preflight.sh` | `a8f62a0ee2705d51da51bf9b9d41b2925a05ad44512270deee2c7f314a36d6b0` |
| `SubTrack/tools/auth/session-owner-rls-proof.sh` | `27483484fabbb1d6e2ff680d1a2513a9c94e7d345f282cca1ff5f6dd0775e9ee` |
| `SubTrack/tools/database/browser-subscription-lifecycle-launcher-proof.sh` | `6fcabf41a13f4217eb5b95e5cc76b2fe4619eb4c850d1c1d8c11f190e192cf69` |
| `SubTrack/tools/database/clean-migration-proof.sh` | `200daf7afaac4817b16a732428bda4156377b482a00599aa3e7a0256026eb2ed` |
| `SubTrack/tools/database/browser-subscription-read-proof.sh` | `659064925195fe15ab81d3b17ea82cce026794d346702070dc983b91d23a4221` |
| `SubTrack/tools/database/test-browser-subscription-lifecycle-launcher-proof.sh` | `4961ebcc20ba825ac0b7c788070cd5ec3b0ae7cf821ee1f160535f35b762bb16` |
| `SubTrack/tools/database/subscription-lifecycle-proof.sh` | `5a6318ba80ef6f052021907d1f0fb71a0222820698fe1b73a4911ca3cbca93c6` |
| `SubTrack/tools/database/subscription-read-proof.sh` | `80ea2b6714d80b3f0be6a3099ec1ba8631bb20ca8a0053a931cec9e6247ed2f8` |
| `SubTrack/tools/database/subscription-lifecycle-http-proof.sh` | `cb7daafc2dcc1e4551bf876370653d6665e9a40f4c5ca82710f40a98fb7c1f09` |
| `.github/workflows/subtrack-native-device-proof.yml` | `d309e42c104da27265accce9e578cdaabdbb913da82fa6a7d6471c0fb67965cb` |
