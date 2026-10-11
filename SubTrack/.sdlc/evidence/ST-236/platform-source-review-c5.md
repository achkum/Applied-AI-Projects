# ST-236 frozen PLATFORM source review C5
- PR281 exact HEAD `859f5ef1fe675ea00ee1414bea6a3230f863c957`: **APPROVE source only**; actual C5 PG16 and acceptance remain pending.
- Relative to C4 `94bf5b7`, executable changes are confined to the foundation proof shell and its focused harness test; the remaining diff is task/evidence metadata.
- Prune checkpoints and four race-case direction/outcome fields use fixed allowlists. Failure kind is bounded; `last_client_sqlstate` uses the existing strict five-character parser and `last_client_exit` its bounded decimal parser before cleanup.
- The last-client fields identify the last private client, not the failing assertion's cause. The real `finish()` writer has valid, unavailable, invalid-field, and private-sentinel nondisclosure cases.
- The prune SQL, assertions, 5000 ms expiry, lock/observer bounds, role and authority checks, fixture custody, pins, and cleanup paths retain their prior behavior; no raw client text or private row value is added to receipts.
- C4 actual run `38133422655` failed at prune before SQL010 and drivers; C1–C3 failures remain historical. C5 still requires exact-head actual PG16, independent QA/security, applicable CI, and Conductor gates before merge.
- No usable HTTP enrollment, signup completion, or global deletion/refresh-race claim follows. Original 09:44:30.897Z L240 attempt1/source1 and 13:44:30.897Z deadline remain in force.
