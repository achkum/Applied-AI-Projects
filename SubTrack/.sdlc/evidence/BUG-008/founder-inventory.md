# BUG-008 current environment inventory

2026-10-10, Europe/Stockholm: In response to "which SubTrack databases exist (local/dev/test/staging/production)? If none exist, say none", the founder replied **none** in this chat. No credentials were requested or received.

This authoritative current inventory resolves the previously unidentified environment set. It does not claim that a database never existed, negate the historical empty local Compose observation, or establish applied checksums on a removed database. No current persistent database is a migration target.

Architect/platform and security read-only reviews found that a clean install still fails due to conflicting subscription definitions and policies referencing not-yet-created tables. Policies also need actual PostgreSQL review for recursion, household consent visibility, immutable ownership and owner-only banking/transaction/charge detail.

BUG-008's original contract forbids rewriting or renumbering migration history and adding missing banking models. Before SQL edits, a narrow amended contract and independently approved exact canonical schema/RLS plan are required. Preserve legitimate banking/catalogue/transaction/charge features; do not remove them merely because current Prisma lacks their models. No existing database, reset, force, DROP, credentials or deployment operation is authorized by this inventory.

Next validation must use a newly created disposable PostgreSQL16 test database, with separate migration/runtime roles and a verified non-superuser non-BYPASSRLS runtime role. Clean migration/schema parity and actual owner/cross-owner/household/share/privacy/mutation/rollback/pool reuse checks remain unrun for a repaired full chain.
