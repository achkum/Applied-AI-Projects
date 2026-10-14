# ST250 image configuration binding source handoff

2026-10-14. Root-authorized narrow repair in two frozen source paths only. Evidence curation performs no further source edits, tests or external actions. Independent consolidated SOURCE review is required before an actual new-head transfer attempt.

| Path relative to Git root | SHA256 |
| --- | --- |
| `SubTrack/tools/sandbox/draft-transfer.sh` | `f2b8154ca78ffe7eba1838b71eb112a99d8f9b2620055b40308ad9a3a63bab3c` |
| `SubTrack/tools/sandbox/draft-transfer-receipt.test.cjs` | `f310a0a55754c847c15e5690a9826d7918e08320b4ecc22494bed04dabca3902` |

## Source-proven issue and repair

Actual backend transfer38575100453 at a30dece reported the closed EXPORT/CONFIG_BINDING/ASSERTION diagnostic. The former `assert.deepEqual(config.config, inspected.Config)` compared archived image JSON with daemon reserialized inspection JSON as if their representations were identical. Official Moby v28 inspection converts OCI configuration to `container.Config`; non-omitempty legacy empty strings/false flags/null slices and maps can appear only in inspection. OCI optional fields may instead be omitted. Newer typed serializers can omit stored explicit-zero optional fields. The diagnostic alone did not identify a specific differing field, and this author inspected no raw archive/config/log payload.

The replacement compares the complete thirteen-field runtime/default portfolio: User, ExposedPorts, Env, Entrypoint, Cmd, Volumes, WorkingDir, Labels, StopSignal, ArgsEscaped, Healthcheck, OnBuild and Shell. It preserves meaningful strings, ordered argument/environment arrays, sorted complete label/port/volume maps and complete healthcheck Test/Interval/Timeout/StartPeriod/StartInterval/Retries settings. Only documented field-specific empty defaults normalize: omitted strings to empty strings; omitted boolean ArgsEscaped to false; omitted/null/empty arrays and maps to empty collections; omitted/null Healthcheck to null; and omitted healthcheck members to their declared defaults. A present healthcheck object is not erased into null. Null strings, wrong scalar/member types, unsafe duration integers, missing array members, accessors, hidden fields, symbols, inherited data and unknown fields reject.

Legacy-only Hostname, Domainname, Image and MacAddress must remain empty strings when present; AttachStdin, AttachStdout, AttachStderr, Tty, OpenStdin, StdinOnce and NetworkDisabled must remain false; StopTimeout must remain absent/null. No generic null stripping, subset comparison, digest waiver or layer waiver was introduced.

Archived configuration bytes still hash to the captured exact image configurationID, and actual inspected Id must equal it. Both archive and inspection explicitly bind Linuxamd64 and layers rootfs; ordered inspected RootFS.Layers must equal archived diff_ids. Existing complete-label comparison and earlier run-label/source/candidate capture remain; every saved layer still undergoes actual byte digest and private-path exclusion. Archive/path/size bounds, immutable same-image qualification, draft-only authenticated transfer, all ownership/removal gates and finite diagnostic classification remain intact.

## Official primary sources

Checked2026-10-14 and embedded as exact URLs in the repaired helper:

- OCI runtime configuration/default definitions: https://raw.githubusercontent.com/opencontainers/image-spec/main/specs-go/v1/config.go
- Docker OCI extensions/healthcheck definitions: https://raw.githubusercontent.com/moby/docker-image-spec/main/specs-go/v1/image.go
- Legacy container inspection Go fields/JSON omission rules: https://raw.githubusercontent.com/moby/moby/v28.0.4/api/types/container/config.go
- Actual OCI-to-container inspection conversion call: https://raw.githubusercontent.com/moby/moby/v28.0.4/daemon/containerd/image_inspect.go

## Observed focused validation and scope

`node --test SubTrack/tools/sandbox/draft-transfer-receipt.test.cjs`: PASS11, fail0, skipped0. The actual source-extracted archive validator accepts both OCI and documented legacy inspection representations and rejects changed inspected identity, platform, rootfs, meaningful runtime value, unknown field, legacy nondefault, changed layer bytes and private layer paths. Actual source-extracted portfolio tests cover all thirteen meaningful fields, healthcheck omitted-zero equivalence, strict types and getter non-evaluation. Existing nineteen-field custody, native binary/UTF8 handling and finite private-data-safe diagnostic cases also pass. Independent Bash `-n` for draft-transfer.sh: PASS. No broad/backend journey suites were repeated.

Read-only inspection of the frozen Android archive validator found no equivalent structural-equality bug: it binds raw configuration SHA and fixed User/Entrypoint/platform/labels/layer values; signer inspection checks specific required fields rather than comparing complete raw and reserialized configuration objects. Android source was not modified.

No Docker, CI, SSH, Git, runtime, release/asset mutation or retry was performed. These are source/test results, not actual transfer, import, deployment or public eligibility evidence.
