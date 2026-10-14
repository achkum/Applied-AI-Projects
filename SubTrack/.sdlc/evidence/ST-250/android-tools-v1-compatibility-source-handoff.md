# Android tools V1 compatibility source handoff

Root-observed run 38605130188 (reported exact source prefix 184) established `V1_CONFIG_CHAIN_BOUND,V1_CONFIG_CHAIN_COMPLETE` and `V1_STAGE_COMPLETE` after the original image, runtime and layer checks. That diagnostic run still rejected extra members; it did not qualify or upload the tools archive.

This change reuses that exact proof. Compatibility is allowed only when the complete Go V1 chain binds to the verified image config and ordered actual layer DiffIDs, and every extra archive member is a canonical digest-matched blob in the proof's bound set. Attestations, unknown members, partial chains and mutations remain rejected. Existing source, image, package, runtime, layer, size and cleanup requirements remain applicable.

| Source | SHA256 |
| --- | --- |
| tools/sandbox/android-transfer-receipt.mjs | 1ff1055a2d3ac08513fedbb1b903553c7b33c3bbb9e989bdd49bb1eade8767ed |
| tools/sandbox/android-transfer-receipt.test.mjs | b3bf6261cabca8fb0774af5be2d1f831bd9be688c1871cb9db9b9add671839c6 |

Four focused tests passed: classic archive, OCI archive, rejecting attestation graph and complete V1 compatibility acceptance with hostile mutations/additional members. Both source files passed Node syntax checks. No CI, Git, Docker, signing or remote actions were executed by this author. Independent source review and an actual qualification run remain required.
