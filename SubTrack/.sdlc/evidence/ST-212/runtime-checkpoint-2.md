# ST-212 runtime author checkpoint 2

Status: PARTIAL; attempt 1 and original elapsed budget continue. This context stops within the 12-call cap. No commit, push, PR, database operation or cleanup.

Focused service and controller specs: 6/6 PASS. API typecheck: PASS. Scoped subscription ESLint: PASS. Git diff --check and source blob hashes are in author handoff.

Changed the household list SQL to require the caller's active household membership while relying on accepted subscription RLS for peer share/open_book routing. Prior direct peer consent lookup was hidden by consent_select owner-only RLS and could suppress legitimate open_book reads. Owner rows remain restricted to an active caller membership in household scope. Peer DETECTED is excluded before keyset/limit; inbox stays owner DETECTED.

Remaining: meaningful repository tests; test-only real guard/resolver/current-session-reader HTTP composition; dedicated disposable PG16 nonowner proof and sanitized CI harness; contracts tests and changed-source coverage; exact-source independent platform/security/QA review. Local Docker/psql absent. Mocks do not establish database acceptance. Parent BUG-008b PR237 remains unmerged.

