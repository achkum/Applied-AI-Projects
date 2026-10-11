# ST-235 SQL platform/security precheck (early, not frozen source approval)
Reviewed SQL 009 at 296 lines against ST-235 source GO, author/security/QA readiness, SQL checkpoint, and SQL 001–008; static inspection only, no PG16 execution.
**Resolved precheck finding 1:** `issue_fixture` DELETE originally used bare `origin`, `chain`, `binding_h` at lines 154–155, ambiguous against nonce columns; root qualified all three as `issue_fixture` parameters, confirmed in current SQL 009.
Static SQL verdict: no remaining concrete blocker found in this scoped review; exercise actual fixture issuance and all grants/locks in qualified PG16 proof.
No SQL 001–008 changes are present in the working diff. SQL 009 grants executor SELECT/INSERT on four FORCE-RLS tables, only lifecycle column UPDATE/CSRF DELETE, fixture-only issue EXECUTE, and runtime-only three current-authority EXECUTEs; no observed producer/provisioner/public.identity grant delta.
Checker locks family/session/CSRF and uses a session-keyed advisory lock plus plain SELECT for immutable credential, consistent with SELECT/INSERT-only credential rights; actual PG proof must validate privileges and races.
Live owner and epoch locks are delegated to the adapter; this precheck does not approve incomplete adapter/proof source or the final frozen PR.
