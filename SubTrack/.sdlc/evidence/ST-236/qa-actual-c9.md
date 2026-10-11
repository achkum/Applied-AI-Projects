# ST-236 C9 independent actual QA — FAILED / HOLD

Frozen PR 281 HEAD `462b20e32bb5cf3857b11111398c815d7afe8335`; [owned PG16 run 38138347866](https://github.com/achkum/Applied-AI-Projects/actions/runs/38138347866) completed FAILURE. Both required owned jobs failed. This is actual-hosted evidence for this HEAD, separate from source approvals.

The foundation job `114466798157` passed the full hosted Linux custody and bounded client lifecycle negative step, correcting the C8 negative-harness failure. Its actual PG16 proof failed. The sole sanitized receipt result is:

`ST-233a foundation: FAIL source_head=462b20e32bb5cf3857b11111398c815d7afe8335 phase=atomic-issue-03 cleanup=removed step=guard-catalog case=parent-fence release=none failure_kind=assertion guard_client_sqlstate=22012 guard_client_exit=3 drift=physical-only`

The first nine `atomic-issue-02` guard cases advanced. In the `parent-fence` case, the installer returned the expected SQLSTATE `22012` and the rollback absence check passed; the required whole-catalog equality then failed. The diagnostic catalog projection, which removes only five physical `pg_class` maintenance fields, matched. This is a precise assertion failure, not acceptance of that projection or proof of which physical field changed. The foundation proof stopped before the complete current-web and enrollment sequence and emitted no foundation PASS marker. Cleanup succeeded.

The separate enrollment job `114466798007` passed locked dependency installation, failed its full PG16 Node driver, and passed exact fixture cleanup and artifact upload. Its sole sanitized receipt result is:

`ST-236 enrollment proof: FAIL source_head=462b20e32bb5cf3857b11111398c815d7afe8335 phase=durable-enrollment cleanup=removed step=driver-exit failure_kind=nonzero-exit sqlstate=unavailable driver_exit=1 checkpoint=first-account`

This advances beyond C8's `fixture-qualification` checkpoint. `first-account` starts before the positive OTP→proof→pending→person staging and includes terminal wrong-verified/wrong-binding denials, an injected profile-write rollback, and identity/birth-residue checks. The fixed receipt does not identify the first failing statement, SQLSTATE, or cause; `driver_exit=1` only establishes nonzero process exit. No `ST-236 durable enrollment: PASS` marker was emitted.

I downloaded both receipts only to private TEMP. Each has exactly 34 unique input pins, and all 34 blob OIDs and SHA256 values per receipt match the committed Git blob bytes at this HEAD: foundation **34/34**, enrollment **34/34**, zero mismatches. No raw Docker, Node, SQL, exception, credential, private identifier, or catalog contents are included here.

[Quality run 38138347744](https://github.com/achkum/Applied-AI-Projects/actions/runs/38138347744) completed SUCCESS for both SubTrack quality gates and ST-004 Compose runtime proof. The exact-head PR check snapshot had nine applicable SubTrack jobs SUCCESS and the two owned PG16 jobs FAILURE; root owns the final all-11 gate and unrelated external-status audit. Passing quality does not waive either actual proof. Earlier C1–C8 failures remain recorded; C8's Linux negative and fixture-qualification signatures are resolved only to the extent directly observed here, while C7's prune and C6's atomic history is preserved.

**QA verdict: FAILED / HOLD.** ST-236 cannot be accepted or merged at C9. Fresh frozen source review, both full exact-head PG16 jobs with original blocking whole-catalog assertion, 34-pin custody, cleanup, full foundation negatives and full enrollment/current-authority functional markers, all applicable CI, and independent actual QA remain required. There is no usable HTTP/signup, production, provider, or global race-safety claim. Preserve original 2026-10-11T09:44:30.897Z L240 attempt 1/source attempt 1, 13:44:30.897Z deadline, and 4700/5000 caps.
