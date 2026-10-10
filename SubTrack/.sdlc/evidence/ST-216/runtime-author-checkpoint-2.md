# ST-216 runtime author checkpoint 2
- Original attempt/time: attempt 1, 2026-10-10 18:26:27 UTC; no review counter changed.
- Owned paths: service/controller/composition/local source and three new adjacent specs. No commit/push by this author.
- Fixed accepted contract error codes 400/401/500 and Express malformed JSON 400 projection. Controller now requires rawBody single JSON string property/value, rejecting duplicate and extra keys before writer; isolated Nest factory uses rawBody true.
- Added invalid created-date denial to exported fixture assertion.
- Focused run: 29 passed, one composition test failed because its fake query sequencing drifted after a rejected request. Fake was revised to dispatch by SQL query kind; revision untested.
- Remaining: run focused tests, lint/typecheck; fix actual findings. Add local provenance spec. Verify regular valid PATCH reaches writer and duplicate/malformed body yields 400 in actual Nest. Inspect coverage >=80 and direct entry security; coordinate fixture author for actual PG proof.
- Root retains heavy-job token. No credentials or raw runtime URL in logs/evidence.
