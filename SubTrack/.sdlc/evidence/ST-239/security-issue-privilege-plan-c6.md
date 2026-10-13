# ST-239 C6 nonce lock privilege — security plan APPROVE, budget BLOCKED

1. C6 proves only `ISSUE/ROLLED_BACK/PRIVILEGE_42501`; it does not identify the denied object.
2. SQL001 grants executor nonce `SELECT, INSERT, DELETE` with no `UPDATE` or UPDATE RLS policy; SQL012 uses nonce `FOR UPDATE` in both `issue_login` and `login_material`.
3. [PostgreSQL 16 privilege docs](https://www.postgresql.org/docs/16/ddl-priv.html) require UPDATE on at least one column for `SELECT FOR UPDATE`; this is a concrete static mismatch and leading candidate, pending qualified denied-object proof.
4. Security approves a proposed Type 2a private lock-only amendment within the existing executor model: grant only `UPDATE(nonce_h)` to executor and add nonce UPDATE policy `USING (true) WITH CHECK (false)`, mirroring SQL012 lock-only patterns.
5. This does not authorize arbitrary nonce modification, a new role/member, broader table grant, RLS bypass, public route, or changed login authority; actual nonce UPDATE must be denied in PG16 tests.
6. Preserve both nonce locks and the two `login_material` calls; replacing a lock with early DELETE would consume authority before the second call.
7. Prefer amending unaccepted SQL012 plus exact startup/catalog and qualified proof pins; leave accepted SQL001–011 unchanged and add no SQL013 for this unaccepted slice.
8. Require qualified PG16 tests for `issue_login`, both `login_material` calls, no-op UPDATE denial, replay, rollback, burn, concurrent lock behavior, and full natural four-variant browser proof with fresh source/bundle hashes.
9. The original L240 deadline has expired and the guard is BLOCKED. This is a reviewable plan only; no implementation, CI, source GO or founder D12 waiver follows until the budget extension decision.
