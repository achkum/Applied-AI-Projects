ST-233k QA source review C1 — REQUEST_CHANGES; frozen head d5e3c3da8362844807d37e6762568f7708f74494 (SQL 008 blob ab627f65a9061fe31c279fafb1ef8f1835d3122e).
Scope reviewed: SQL 008, proof, workflow, ADR-0030 against ST-233k Type 2a readiness; no PostgreSQL or CI execution is claimed.
Blocking proof bug: `IFS=, read -r -a ak_fields <<< "$ak_args_current"` splits commas inside `repeat('x',64)`, so the asserted 12 fields cannot hold and the proof exits before NULL, tamper, capacity, duplicate, and race coverage.
Use an explicit 12-expression array for NULL substitutions, preserving each positive call argument and the per-field refusal checks.
Coverage gap: full owned-tuple tamper lacks reservation transport corruption; temporarily drop its transport CHECK inside a rollback transaction, set transport to a non-web value, and assert generic refusal plus no mutation.
Coverage gap: configured epoch origin corruption is untested; input-origin mismatch alone does not prove the stored config guard. Corrupt the epoch origin/check only inside rollback and assert refusal/no mutation.
The SQL operation has the intended lock order, postwait clock, fresh global count, fixed purpose digest map, nonce INSERT plus conditional completed UPDATE, and postinsert raise; the source cannot be approved until qualified PG16 proof executes.
Preserve exact 001–007 parent body/ACL/fixture/FK guards, 008 pin, role denials, and independent Node purpose oracle in the corrected frozen head.
