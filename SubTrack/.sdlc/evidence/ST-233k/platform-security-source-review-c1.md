ST-233k independent platform/security SOURCE review c1 — frozen head d5e3c3da8362844807d37e6762568f7708f74494: REQUEST_CHANGES; two blocking proof defects, no security veto on inspected SQL boundary.
SQL008 is private executor-owned SECURITY DEFINER, runtime EXECUTE only; no table/column/membership/producer/PUBLIC grant or nonce UPDATE.
Installation checks six existing functions from seven parent files by catalog/body/ACL and checks roles, schema, tables, types, constraints, fixture and any-schema inbound nonce FK before DDL.
Operation locks epoch, shared capacity and owned pending reservation, then samples DB time; fixed three-purpose request digests match independent Node oracle, and global nonce count precedes INSERT plus conditional completed settlement.
Post-insert settlement failure raises and rolls back; no HTTP, adapter, previous-cookie LIVE, or release activation follows from this SQL.
Blocking proof defects: proof.sh:1171 catalog expects six `h` OIDs but signature has seven, so its post-install assertion fails; proof.sh:1206-1208 splits `ak_args_current` on commas inside `repeat('x',64)`, so its 12-field assertion also fails.
Correct the catalog vector and use an explicit 12-expression argument array, re-freeze, and rerun actual qualified PG16/CI; static Bash syntax alone does not establish the required proof.
Reviewed source only; no PostgreSQL or CI execution claimed. Preserve original task clock, source attempt, budget and this c1 history.
