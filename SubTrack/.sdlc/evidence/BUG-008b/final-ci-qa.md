# BUG-008b exact-head CI QA (2026-10-10)
- PR 237 head verified as `207494f5e0d071cf3ea02fcdeca947e7fbf38d59`.
- Standard CI run 38065675819 PASS; quality gates and Compose runtime proof passed.
- Container proof run 38065675832 PASS; API/web image build and smoke receipt passed.
- Full-chain PG16 run 38065675834 PASS; owned-fixture proof and recorded-container cleanup passed. Its only run artifact is a 112-byte sanitized receipt: `PASS migrations=2 ledger_checksums=2 modeled_drift=0 vitest_tests=1 ordinary_login=1 service_logins=4`.
- Historical session-owner run 38065675837 PASS; disposable proof and recorded-container cleanup passed.
- PR checks are not all green: both Vercel previews failed with external 24-hour build-rate-limit status.
- QA gate: merge remains blocked; this is not merge approval or an all-green claim.
