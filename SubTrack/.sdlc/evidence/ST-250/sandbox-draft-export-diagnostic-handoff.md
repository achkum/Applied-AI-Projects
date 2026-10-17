# ST250 bounded EXPORT diagnosis source handoff

2026-10-14. Actual f32b942 transfer38566479368 qualified the same image, then emitted only phase=EXPORT before draft upload. Source alone cannot identify which export operation failed. Docker's official save documentation describes a tar archive and gzip wrapper; containerd documentation distinguishes compressed/uncompressed layer storage and cautions save behavior. These support inspecting actual evidence, not loosening archive/config/layer assertions speculatively: https://docs.docker.com/reference/cli/docker/image/save/ ; https://docs.docker.com/engine/storage/containerd/ .

Only the two frozen files below changed. Added closed EXPORT substeps RAW_SAVE, RAW_DIGEST, ARCHIVE_INDEX, ARCHIVE_MANIFEST, CONFIG_BINDING, LAYER_EXTRACT, LAYER_DIGEST, LAYER_PATHS, GZIP, COMPRESSED_DIGEST. Fixed categories ASSERTION, JSON, FILE, TIMEOUT, BOUND, SIGNAL, COMMAND, OTHER come from privately branded assertions, actual SyntaxError or a small own-data code/status/signal whitelist; no message/stack/archive/path/size/env values are read or emitted. Cleanup failure still overrides diagnostics with CLEANUP. All save/config/layer/byte/secret exclusions, upload boundaries and cleanup assertions remain intact.

Two focused tests PASS: actual small archive validator reports the correct finite config/layer/private-path checkpoint, and actual diagnostic function checks all step/category pairs plus hostile/private getter refusal. Publisher inline Node and Bash syntax PASS. No unchanged broad tests, Docker, CI/retry, release or remote actions. No exact underlying export defect is claimed; one independently reviewed causal execution is still required.

- SubTrack/tools/sandbox/draft-transfer.sh: 93c50a6f1ad9d8ab57339b5e1e981f2c576d8b9e98925a8809568179219ecb91
- SubTrack/tools/sandbox/draft-transfer-receipt.test.cjs: 15e13d510a6b4b147fa0072e337250c26fd8581a76da84705dfceb9a9203c1ff
