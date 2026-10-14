# ST250 image config binding independent SOURCE review

2026-10-14. **Platform/privacy SOURCE GO for the bounded two-file repair.** Independently matched:

- tools/sandbox/draft-transfer.sh: `f2b8154ca78ffe7eba1838b71eb112a99d8f9b2620055b40308ad9a3a63bab3c`
- tools/sandbox/draft-transfer-receipt.test.cjs: `f310a0a55754c847c15e5690a9826d7918e08320b4ecc22494bed04dabca3902`

Reviewed actual field-specific portfolio/binding and focused regression source against the explicit OCI, Docker image and Engine container/config schema distinctions cited in source. No concrete material defect found. This is semantic comparison of distinct representations, not a field-subset waiver: User/ports/Env/Entrypoint/Cmd/Volumes/WorkingDir/Labels/StopSignal/ArgsEscaped/Healthcheck/OnBuild/Shell remain covered. Only named documented omitted/null/empty collection, omitted/empty string, omitted/false flag and absent/null StopTimeout defaults normalize. Legacy nondefault host/attach/TTY/network controls, nonnull timeout, unknown fields and invalid types reject. Nested arrays/maps/healthcheck descriptors reject accessors, hidden/inherited/symbol/unknown data without evaluating getters.

Raw saved config SHA256 must still equal captured imageId and inspected.Id. Both representations require exact Linuxamd64; saved rootfs.type and inspected RootFS.Type require layers, and saved ordered diff_ids equal inspected RootFS.Layers and the archive layer count. Every actual extracted layer digest, private-path exclusion, byte bound, same-image custody, upload and cleanup gate remains. The focused source tests preserve hostile portfolio and raw-ID/architecture/layer/config drift cases. Root reports eleven focused PASS and Bash syntax PASS; reviewer did not rerun them.

No archive/config/layer acceptance is inferred from source. One reviewed actual causal export/transfer execution still must prove the repaired representation boundary. No repeated suites, Git, CI, Docker, SSH, external or runtime actions; this evidence file only.
