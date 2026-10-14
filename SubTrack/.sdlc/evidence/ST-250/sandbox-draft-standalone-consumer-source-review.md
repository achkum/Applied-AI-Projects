# ST250 standalone VPS consumer independent SOURCE review

2026-10-14. **Platform/privacy SOURCE GO for the bounded two-file packaging repair.** Actual hashes match:

- tools/sandbox/draft-transfer-receipt.cjs: `1b913e3377c5d40ff99960dbc82a989637523e9858e4e4e6e9eba2def3468e44`
- tools/sandbox/draft-transfer-receipt.test.cjs: `f7f9f3986b1f086d10eb91dc5a3fc4c3fee731d36e5d636c2342f3ecc2d6c5b0`

The module replaces its hosted qualification-tool import with the identical immutable Node22.18.0 base-image pin. Direct comparison confirms exact equality with tools/database/sandbox-qualification-receipt.cjs. Consumer dependencies are now only node:crypto and standalone-CLI node:fs; the finite nine-file VPS source pack no longer needs the excluded database qualification tree. No manifest/receipt field, semantic literal, hash/byte/remote binding or validation/cleanup gate changes.

The regression copies only the actual module into a fresh isolated directory and starts a real Node subprocess requiring that copy and validating a manifest fixture whose baseImage still comes from the canonical qualification module. Exact accepted pin output is checked. This detects both an accidental restored local import and divergence of the duplicated literal. Root reports the focused regression PASS; reviewer inspected it without execution.

No material defect found. The source cause of the observed MODULE_NOT_FOUND is resolved; coherent new-head source ledger/image qualification and actual staged consumer/import verification remain execution gates. Existing offline VPS staging is not reset and no key/database action is implied. No tests, Git, CI or remote actions; this evidence file is the only write.
