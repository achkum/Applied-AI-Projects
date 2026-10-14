# ST250 tools diagnostic reasons independent SOURCE review

2026-10-14. **Consolidated platform/privacy SOURCE GO for the bounded two-file reason refinement.** Actual hashes match:

- tools/sandbox/android-transfer-receipt.mjs: `202ad4b4b2054bc426300e61f92134dfcbcd06efda78963dad9ff4503338e67a`
- tools/sandbox/android-transfer-receipt.test.mjs: `52ccaec418067bb6370e885c9416e0d7ad35dd719f967c2434f5814560b20de3`

Reviewed only new reason classification and focused cases. No material defect found. Name/content SHA binding precedes class selection. RAW_SAME_VERIFIED_LAYER compares exact raw content digest with ordered DiffIDs whose archive layers have already passed their digest checks; it is not inferred from format or caller metadata alone. GZIP equality is attempted only for<=1MiB extra bytes, with512MiB maximum inflation, and compares the inflated digest against that same verified set. Larger extras only receive a fixed size/magic label, with no decompression or JSON work.

Magic, invalidUTF8/JSON, noncanonical decoded shape and unrecognized reasons use finite constants. The previous UTF8 roundtrip and JSON.stringify equality still precede all index/manifest equivalence classes; duplicate keys/whitespace cannot gain an equivalence label. NONCANONICAL labels describe decoded shape only. No raw names/digests/bodies/errors are output. Every extra still reaches unavailable regardless of class; no receipt, archive acceptance or custody gate is widened.

Focused source fixtures check measured raw/gzip identity, size/magic reasons, invalidUTF8/JSON, noncanonical index/manifest/config/other and preserved mismatched graph rejection; the actual inspector always throws. Author reports focused2 tests/syntax PASS; reviewer did not rerun. No broad tests/research, Git, CI, Docker, keys or external/runtime actions; this evidence file only. Actual tools archive/import and separate import compatibility remain pending.
