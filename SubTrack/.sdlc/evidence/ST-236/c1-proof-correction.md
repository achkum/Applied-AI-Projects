# ST-236 C1 proof correction
Frozen C1 `45c8193` received independent platform, security, and QA REQUEST_CHANGES: the proof expected and inserted nonexistent `identity_birth.expires_ms`.
The birth row has only `(identity_id,xid)`; expiry belongs to `enrollment_intent`. The corrected seed links a birth to an expired intent, and the existing prune assertion requires both rows gone.
The integration now executes owner and foreign identity reads under runtime and executor roles, checks both server owner GUCs, and requires foreign and mismatched-owner reads to return zero rows.
This is a source correction only. Actual PG16 run `38131421699` failed during migration cleanup before SQL010; it has not yet validated the corrected path.
Retain frozen C1 rejection and actual PG16 failure 1 as historical results; rerun qualified PG16 and exact-head CI after the independent harness fix.
