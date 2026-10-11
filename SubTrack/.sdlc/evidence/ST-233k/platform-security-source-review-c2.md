ST-233k independent platform/security SOURCE review C2 — frozen head f25d0e6b513103c5e46f0a3fcee14c193cd37057: APPROVE source conformance; blocker0/major0, no security veto; actual PG/CI gate remains pending.
SQL008 blob ab627f65a9061fe31c279fafb1ef8f1835d3122e is unchanged from C1; Type 2a private executor-owned SECURITY DEFINER operation grants runtime EXECUTE only, with no table/column/role/PUBLIC expansion or nonce UPDATE.
Installation guards seven parent files' six functions, exact bodies/catalog/ACL and fixture/schema/role/constraint envelope, including any-schema inbound nonce FK before DDL.
Operation locks epoch, shared capacity, exact pending reservation, then samples bounded DB time; fixed purpose/request mapping matches independent Node oracle and global count spans purposes, epochs and expired rows.
Full owned tuple is rematched; nonce INSERT with NULL authority and conditional completed settlement share the transaction, with post-insert mismatch raising rollback.
Proof C2 fixes both C1 blockers: catalog now lists seven `h` arguments; NULL cases use twelve explicit SQL expressions without comma parsing. It adds transport and origin corruption refusals.
Qualified PG16 script covers independent burn, commit/rollback/fault, purpose pairs, duplicate/capacity, role/ACL/guard and blocked-lock races; source inspection finds no further blocker.
This is a source verdict only: actual PostgreSQL execution, fresh exact-head CI and independent QA must pass before acceptance; no adapter, HTTP, previous-cookie LIVE or release claim. C1 receipt/history remain intact.
