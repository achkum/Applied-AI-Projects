ST-233k QA SOURCE — APPROVE Type 2a conformance at frozen f25d0e6b513103c5e46f0a3fcee14c193cd37057; base 07d7fff934244df2ed0af6c704ad7e34d284b7eb.
SQL 008 blob ab627f65a9061fe31c279fafb1ef8f1835d3122e is unchanged from C1; proof blob 99f42554f9fe2d8336c437789454f88226406883 repairs the C1 catalog arity and CSV split.
The explicit 12-expression NULL array matches the positive argument string; each position is substituted independently.
Rollback negatives now corrupt reservation transport and stored epoch origin, with private snapshot and pending/no-nonce assertions.
Source proof also covers independent committed burn, all three Node-verified purpose pairs and six mismatches, commit/rollback/postinsert fault, duplicates, global capacity, waits, winner/loser, roles and install drift guards.
The SQL body locks epoch, shared capacity, then reservation; samples time after waits; counts all nonce rows; atomically inserts NULL-authority nonce and completes the fully owned pending burn.
This is source approval only. Actual qualified PG16 SCRAM execution, exact-head CI, and independent actual QA remain mandatory before merge; no runtime result is claimed here.
