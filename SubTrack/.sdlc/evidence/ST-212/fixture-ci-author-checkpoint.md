ST-212 devops fixture checkpoint — PARTIAL, attempt 1.
Added only `tools/database/subscription-read-proof.sh` (73 lines) and `.github/workflows/subtrack-subscription-read-proof.yml` (40 lines).
Harness uses a newly owned labelled PG16 tmpfs container, ignores inherited `DATABASE_URL`, migrates via fixture owner, and supplies `fixture_owner` / ordinary `st212_runtime` runtime-role URLs to the dedicated Vitest config.
Recorded container cleanup checks its ID format and ST-212 label; receipt contains only sanitized phase/code or a wrapper pass marker and is uploaded with `always()`.
`bash -n` passed; no database, container, install, or integration proof was run locally. Runtime author is still completing the integration entrypoint/config.
Next: recheck the finalized fixture test/config against environment contract; send exact-source handoff to Conductor for independent review.
