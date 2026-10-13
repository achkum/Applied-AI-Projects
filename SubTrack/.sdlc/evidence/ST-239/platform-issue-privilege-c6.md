# C6 ISSUE privilege candidate (read-only review)

- C6 first SV verify reached `ISSUE / ROLLED_BACK / PRIVILEGE_42501`; its fixed marker does not identify the denied object.
- SQL 001 grants executor `SELECT, INSERT, DELETE` on `subtrack_auth.nonce`, with no `UPDATE` or nonce UPDATE policy; SQL 012 `issue_login` line 172 selects that row `FOR UPDATE`.
- PostgreSQL requires UPDATE privilege on at least one column for `SELECT FOR UPDATE` ([privilege reference](https://www.postgresql.org/docs/16/ddl-priv.html)); this is a concrete static mismatch and the leading cause candidate, not a proved denied-object attribution.
- The same unsupported lock is in SQL 012 `login_material` line 122, called before session creation and again by `consume_login`; consuming the nonce there would break the second call.
- Smallest behavior-preserving proposal: successor private SQL migration grants `UPDATE(nonce_h)` to `subtrack_auth_executor` and adds nonce `FOR UPDATE` RLS policy `USING (true) WITH CHECK (false)`; no nonce value may be changed, while existing row locks remain.
- Pin exact nonce grant/policy shape in catalog assertions and qualified SQL tests; prove `issue_login` and both `login_material` calls succeed, actual nonce UPDATE fails, replay/rollback/burn and competing-transaction behavior remain intact.
- This is a private Type 2a candidate with a security-sensitive privilege-model change; obtain architect/security review before source authorization. Budget-expired guard remains BLOCKED; no migration, source, CI, or runtime action is authorized here.

Conductor scope note: SQL012 is unaccepted on this draft branch; prefer a reviewed amendment to SQL012 and its exact catalog/test fence rather than a successor migration. Accepted SQL001–011 remain immutable. No source GO; grant delta classification awaits independent security.
