# ST-236 C10 independent actual QA — FAILED / HOLD

Frozen PR 281 HEAD `7955f192d245d5d079742a9706fa62a9ec7b6634`; [owned PG16 run 38139270983](https://github.com/achkum/Applied-AI-Projects/actions/runs/38139270983) completed FAILURE. Both required jobs failed: foundation `114469563358` completed at 2026-10-11T12:34:13Z and enrollment `114469563555` at 12:27:23Z. This is actual-hosted evidence for the frozen C10 commit, independent of later uncommitted C11 worktree edits.

The foundation receipt emitted `ST-236 atomic catalog projection probes: PASS`. It also emitted preceding `ST-233l driver: PASS`, `ST-233m port: PASS`, and `ST-235 durable current web: PASS` markers. The complete foundation sequence then failed in the durable-enrollment driver; there is no `ST-233a foundation: PASS` marker. Its exact sanitized result is:

`ST-233a foundation: FAIL source_head=7955f192d245d5d079742a9706fa62a9ec7b6634 phase=durable-enrollment cleanup=removed step=driver-exit failure_kind=nonzero-exit sqlstate=unavailable driver_exit=1`

The separate enrollment job reached the `first-account` checkpoint and failed on its `first-admit` query with SQLSTATE `42501`. The exact sanitized result is:

`ST-236 enrollment proof: FAIL source_head=7955f192d245d5d079742a9706fa62a9ec7b6634 phase=durable-enrollment cleanup=removed step=driver-exit failure_kind=nonzero-exit sqlstate=unavailable driver_exit=1 checkpoint=first-account node_step=first-admit node_query=admit node_sqlstate=42501`

This identifies the first-admit permission denial in the actual C10 driver; it does not prove a successful account transaction or any later first-account assertion. The foundation receipt does not include the enrollment diagnostic fields, so its cause is not independently inferred from that receipt. Both receipts report `cleanup=removed`.

I downloaded the two receipts to private TEMP and checked each input line against the committed Git blob at the frozen HEAD, hashing the blob bytes directly. Each receipt has exactly 34 unique input pins; foundation **34/34** and enrollment **34/34** blob OIDs and SHA256 values match, with zero mismatches. No raw Docker, Node, SQL, exception, credential, private identifier, catalog content, or row values are included here.

[Quality run 38139270981](https://github.com/achkum/Applied-AI-Projects/actions/runs/38139270981) completed SUCCESS on the same HEAD for SubTrack quality gates and ST-004 Compose runtime proof. That result does not waive either owned PG16 failure. The C9 whole-catalog assertion failure and earlier C1–C8 failures remain historical evidence; C10's passing atomic projection probe does not establish a full foundation PASS.

**QA verdict: FAILED / HOLD.** ST-236 cannot be accepted or merged at C10. The C11 row-lock ACL correction requires a new frozen source review and both full exact-head PG16 jobs, 34-pin custody, cleanup, complete foundation and enrollment functional markers, all applicable CI, and independent actual QA. There is no accepted HTTP/signup, production, provider, or global race-safety claim. Preserve the original 2026-10-11T09:44:30.897Z L240 attempt 1/source attempt 1, 13:44:30.897Z deadline, and 4700/5000 caps.
