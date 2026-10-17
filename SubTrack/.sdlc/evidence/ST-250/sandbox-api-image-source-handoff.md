# ST250 sandbox API image preparation source handoff

2026-10-14. Exactly two frozen executable paths implemented. No local Docker executable/build, Git mutation, workflow dispatch, registry publication, VPS operation or runtime credential creation.

| Git-root-relative path | SHA256 |
| --- | --- |
| `.github/workflows/subtrack-sandbox-api-build.yml` | `2a294f62142326f397f852b478bab530e0e53d39175f993962db2f6814a797b5` |
| `SubTrack/tools/sandbox/build-api.sh` | `52517f7e8c478b123e300c4559193978c310cbb365c0cfbc3dcba22a4ae02036` |

Manual exact-head standard ubuntu24 workflow, contents:read, disabled persisted checkout credentials and immutable existing approved checkout/upload action pins. Actual Docker BuildKit Linuxamd64 build uses reviewed Dockerfile and raw-byte registry-verified Node22.18 child digest from the plan; no credential args/mounts, package push or image tar upload. Unique labelled image/container IDs are captured before execution. Private build logs have a4MiB file bound and20-minute build deadline; runtime probes are30seconds, job30minutes.

Actual image inspection checks ID/platform1000:1000/dedicated main CMD and disabled production-shaped publication flags. No-network/read-only/dropped-capabilities/no-new-privileges/memory384MiB/PID64/CPU1 containers probe actual pg and nativeTS sandbox contracts, require real compiled main, compare embedded two SQL hashes to checkout, hash main and assert actual UID/GID/Node22.18. Read-only filesystem is asserted by rejected zero-length append to node-owned main. Default invocation must exit1 with only fixed Sandbox startup unavailable stderr and empty stdout, rather than claim successful startup.

Cleanup verifies captured IDs and exact run labels before removal, then successful daemon list calls prove absence. No global prune/prefix cleanup. Closed eleven-field receipt with five true preparation checks is generated privately after container/image cleanup, then uploaded only after exact temp cleanup is confirmed; failed/unknown cleanup removes receipt and reports a fixed stage. Intermediate builder cache remains confined to the disposable hosted runner; no cross-run cache export.

Actual lightweight checks: Git Bash syntax PASS; unconfigured launcher refuses before Docker/remote action with fixed SETUP exit1; YAML2.9.1 parses workflow and passes manual-trigger/permission/runner/deadline/pins/no-persist/retention assertions; extracted actual receipt projector9 cases PASS, covering valid output and malformed version/extra/missing/hash/head/image/Dockerfile bindings. No heavy suite repeated. Initial one-off YAML assertion command had a JavaScript syntax typo and was corrected; only the successful parser result is claimed.

Independent SOURCE review must precede root dispatch. Actual build/import/failclosed result remains pending. This is packaging evidence only; actual PostgreSQL first-beta runtime, public TLS/gateway and installed Android/iOS acceptance remain separate required checks. No public activation performed.
