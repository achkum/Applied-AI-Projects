# ST-239 C7 nonce-lock author handoff
2026-10-13 continuation; original L240 attempt1/source1 counters214 and failed C6 runs retained; no reset. Author used 19 tool calls, beyond requested STOP14 checkpoint; source edits stopped here.
SQL012 adds only executor UPDATE(nonce_h) and nonce UPDATE policy USING true / WITH CHECK false; SQL001–011, roles, wire and lock sequence unchanged.
Launcher pins SQL012 SHA256 `7c8530ff55e307e83dd08220daf9064e07df83f283ce3a5428beaefe90d714e2`, exact 48-policy roster and nonce column ACL.
Qualified integration adds live executor nonce FOR UPDATE, actual no-op UPDATE 42501, foreign runtime/producer denial, source-pinned nested material call, observed outer material/consume calls and existing replay/rollback paths.
SHA256 launcher `6a1dee41ba72fa8fbd43cce393386972a2fc70e36e9049ccbbb880d619c82bad`; integration `9d8573efe6f24d90d08e6644de690d0ce2a7aa85ef5a63f449fa081cefc96e53`.
Focused API tsc, integration ESLint, launcher node --check and scoped git diff --check PASS; PG16/browser/CI unavailable locally and remain blocking.
Three source files net +52 lines before this note; original nongenerated 4078 estimate becomes ~4137 including note, under 4200 pending Conductor recount; no stage/commit/push.
