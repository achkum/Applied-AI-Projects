# ST-250 executable VPS source repair handoff

Disposition: source ready for independent review; no execution or deployment acceptance. Supersedes the prior five-file executable handoff for these current hashes.

- `infra/sandbox/compose.yaml` — `a6d0f342e27cbbca8f8c22420783b473815df96d7f823c4e9d04903d975d8175`
- `tools/sandbox/deploy.sh` — `9213c5e09c1380b2ae355b36f68046d1a15d54931e3b76e1ea9b8dae7bbf9fe2`
- `tools/sandbox/verify.sh` — `690d11b87ebb8ec01009a46b99a2c242fd722a86758304dea116ed7215f2e8d5`
- `tools/sandbox/activation-contract.test.cjs` — `3b8fc9e699a115fa06512e5435f8c7e974e99bf92f002afc244f7d5651f202d5`
- `docs/ops/SANDBOX.md` — `adb89d3510c796be866d5550b24da1067fed814b0f520f1787451028727a9e3b`

## Concrete corrections

- Conditional cleanup ownership predicates now explicitly return failure, including Docker inspection failures; they do not depend on errexit propagation.
- Fresh initialization labels each of exactly three local volumes with its role, source head, authenticated transfer run and UUID creation generation. Before the root-only empty-directory ownership operation, it captures actual Docker inspection to a noclobber private record and validates supported Name/Driver/Scope/CreatedAt/Mountpoint/Options/Labels properties. No invented volume ID is used. Retained verification binds those records and generation to current inspection; recreation, role swap, wrong source/run/generation and nonlocal/options changes fail without resetting data.
- Live qualification independently inspects the exact pinned PG/Caddy image references and local API configuration ID, and binds each running service to that configuration ID. It compares inherited image environment with exact service overrides, exact entrypoint/command, complete secret/source/named-volume RW portfolio, tmpfs, namespace/service/source labels, budgets, network/ports, log rotation and privilege portfolio. Extra mounts, capabilities, devices, device requests and unconfined security options fail.

## Actual validation

`node --test tools/sandbox/activation-contract.test.cjs`: 9 tests PASS. Three added tests execute actual extracted shell ownership helper and embedded volume/live validators; each service has positive and hostile-image/env/entrypoint/mount/privilege cases. Existing six tests remain. Windows secret custody cases remain platform scoped; Linux-only UID/mode behavior is not claimed executed here.

Git Bash syntax checks for both actual shell files PASS; every actual Node heredoc parses PASS. No Docker, SQL, VPS, real key generation, Git or hosted actions were performed. Actual Docker inspection shapes and live resource/readback gates remain required before activation acceptance.
