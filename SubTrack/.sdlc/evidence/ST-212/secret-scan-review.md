# ST-212 secret-scan review — APPROVE_EXACT_FINDING
At commit 0a1e86a6d759a0f20dd2f5a8a2bfe13933100be0, Gitleaks flags `generic-api-key` at `SubTrack/.sdlc/evidence/ST-212/final-contract-qa.md:2`.
The flagged `6da7f90b79fe4c3c4114fe733d9ecf053dd53dcc` exactly equals that commit's Git blob ID for `SubTrack/packages/contracts/tests/v2-auth.test.mjs` and the current file's `git hash-object` output.
This is a public, deterministic source identifier, not a credential; APPROVE only `0a1e86a6d759a0f20dd2f5a8a2bfe13933100be0:SubTrack/.sdlc/evidence/ST-212/final-contract-qa.md:generic-api-key:2`.
No rule, path, or whole-file exemption is approved. Exact-head secret scan and CI remain required after the narrow ignore entry.
