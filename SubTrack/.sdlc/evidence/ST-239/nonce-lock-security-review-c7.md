# ST-239 C7 nonce lock security source review — APPROVE

- Exact worktree SHA-256: SQL012 `7c8530ff55e307e83dd08220daf9064e07df83f283ce3a5428beaefe90d714e2`; launcher raw `6a1dee41ba72fa8fbd43cce393386972a2fc70e36e9049ccbbb880d619c82bad` (LF `aeedaa1e2ab9a822e957aa2487bdb063dae6c63010c9ddd19c753fa97425f361`); PG integration `9d8573efe6f24d90d08e6644de690d0ce2a7aa85ef5a63f449fa081cefc96e53`.
- SQL012 adds only executor `UPDATE(nonce_h)` and nonce UPDATE RLS `USING(true) WITH CHECK(false)` for existing `FOR UPDATE` locks; no role membership, actual nonce write, public grant, bypass, API wire or SQL001–011 change.
- Launcher repins SQL012, policy count and exact nonce column ACL; existing full policy/grant catalog comparison still applies.
- PG proof locks a terminal nonce as executor, requires no-op UPDATE denial `42501`, denies runtime/producer write, observes direct `login_material` and checks the nested consume call; existing replay/rollback/burn cases remain. Cleanup retains original and rollback errors and discards a failed connection.
- This is a Type 2a lock-only repair to the approved private executor authority. C6 `PRIVILEGE_42501` remains a leading candidate, not an identified denied object or a C7 actual PASS.
- **Security exact-source APPROVE for C7 CI**, subject to committed-byte carry. Author reports typecheck, lint, syntax and diff checks passing; qualified PG16/browser, pixels and all applicable CI remain blocking. Original ST-239 history/counters and approved 90-minute continuation clock remain intact.
