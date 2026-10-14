# ST250 tools extra-member diagnostic independent SOURCE review

2026-10-14. **Consolidated platform/privacy SOURCE GO for the bounded diagnostic refinement.** Final repair closes this record's sole canonical JSON HOLD. Actual hashes match the final bounded tuple:

- tools/sandbox/android-transfer-receipt.mjs: `42d6c19660106ad79255e6c81f5530d4406d04d78aaad6d77b83f883f1a36942`
- tools/sandbox/android-transfer-receipt.test.mjs: `e8b7cd9718a57bd303a0a9cf91a0f1a9eb3f7016561806d997f271caf5e47914`

No acceptance widening or raw-data leak was found: the extra-member loop still calls unavailable after assigning any class, including byte-identical root index, same descriptor and same manifest graph. WeakMap/fixed-error output contains only fixed labels; no names/digests/bodies/original errors are emitted. Existing archive/config/layer and final-receipt predicates remain unchanged.

The final extraToolMemberClass now requires byte/name SHA binding,<=1MiB size, valid UTF8 byte roundtrip and JSON.stringify(parsed) equality before structural/equivalence classes. Duplicate-key/alternate serialization cannot collapse into an equivalence label; malformed cases receive fixed EXTRA_BLOB_OPAQUE. Root-index identical-byte, same-descriptor and manifest same-graph labels remain source-owned measured facts rather than acceptance.

Bounded re-review inspected only the added guard and focused fixtures for duplicate schemaVersion/manifests, trailing whitespace and invalidUTF8; each expects OPAQUE while the actual inspector still throws. Existing finite labels/rejection assertions remain. Author reports the focused regression and syntax PASS; reviewer did not rerun tests. No remaining material defect found.

No broad tests, research, Git, CI, Docker, SSH, implementation or remote actions; this evidence file only. Import compatibility and actual tools archive success remain separate work.
