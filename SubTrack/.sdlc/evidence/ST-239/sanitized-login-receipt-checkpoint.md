# ST-239 sanitized login receipt checkpoint

Scope: `tools/database/private-profile-proof.sh` only. This edit exports the three already-gated ST239 browser PASS lines with exact locale/theme, and extends both existing structured FAIL exporters to `case=login` plus the closed login phase roster assigned in `apps/web/test/private-profile-browser.mjs`. Existing status and field enumerations remain unchanged. No raw browser log or arbitrary values are exported.

Validation: Git Bash `bash -n` PASS; `git diff --check` PASS. Full browser/PG proof was not run in this bounded receipt edit. The combined working-tree diff contains earlier storage-author changes; this edit changed only the two FAIL regex lines and added the five-line ST239 PASS export block.

SHA-256 `tools/database/private-profile-proof.sh`: `0DE26B3C2DA7B8E80986920F7EC28820691C2FBF3FB02DB02E1B5CEB07C4433C`.

Author checkpoint: original L240 source1, no reset; 9 tool calls including this evidence write, approximately 7 minutes. No Git operation beyond read-only status/diff/check. Handoff to root and independent reviewers for exact-source review and actual qualified browser/PG execution.
