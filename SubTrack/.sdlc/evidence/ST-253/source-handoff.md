# ST-253 delivery preparation repair handoff

Measured exact-source failures and bounded repairs:
- Ordinary API Dockerfile omitted synthetic package copies/runtime output and existing bank/detection compilation. Build and production stages now include the package and required existing build outputs before API compilation. Accepted sandbox Dockerfile/package/lockfile unchanged.
- Android receipt policy uses genuine HEAD^; unsigned/private-delivery shallow checkout had no parent. Only those two checkouts now fetch depth2; signed-return depth0 and exact repository/branch/head/free-draft guards remain unchanged.
- Both installed-native drivers stopped before app launch on obsolete RN0.74.5 assertion. Exact accepted RN0.81.5 now matches locked SDK54; NODE_ENV/private fixture/platform guards remain. Native preparation builds existing detection runtime before updated API fixture imports.

Validation: three tests execute the actual extracted source precondition block; both platforms accept the locked version, stale/unreviewed versions fail, and environment/platform rejection precedes package/fixture work. Driver syntax passes. Parsed YAML comparison confirms bounded checkout/build/test additions and unchanged authority. API dependency/build/runtime copy closure source checks pass. These checks do not establish actual Docker compilation, installed app behavior or release readiness; applicable new-head CI remains required.

Frozen source hashes supplied to independent reviewer. No runtime, Git, CI, SSH, package upgrade, credential, key or backend changes performed by author. Root batches this repair with ST252 update tooling in the existing feature PR to avoid duplicate stacks and repeated checks.
