# Detection persistence repair handoff

Actual owned PostgreSQL16 proof localized first scan500 to CANDIDATE_WRITE/PERMISSION. Source diagnosis found subscription INSERT RETURNING interacting with the canonical STABLE visibility lookup before the new row is visible. Grants and direct candidate policies are correct; they are unchanged. PostgreSQL16 policy/snapshot documentation was independently checked by root.

The three-path fix performs plain INSERT and requires exact INSERT command,rowCount1,rows0, then a separate owner/id/source/status/private-bound SELECT requiring exact id/revision1 within the same current-authority transaction before candidate/source writes. It preserves owner/session/generation fences, rollback, Money, defaults, idempotency/dedup and all real-PG assertions. No permission, policy, volatility, migration, endpoint or provider change.

Twenty affected tests pass, including operation order and unexpected insert/readback command/count/rows/id/revision/missing/ambiguous cases. Final all-three-file lint and API typecheck pass. Source hashes: statementsc0079adb1a3818c45d5006e50e9285b307c5c858ff66eaf9751a7066eca4aa10; service1fb5d5e8daa4f9d91092f0376c02542c33fc6920f6c606798dbe7894411fe7d8; spec8e559c8438190f66c17f63bed68f1e64cc8f8a5de0d37933350e11c4a865e519.

Pending independent server/security source review and actual owned-PG scan/inbox/readback/replay qualification. Current tester version2 and VPS backend/key/data remain untouched. Source test success is not installed-native acceptance.

Independent server/security source review: SOURCE GO. Reviewer matched all three hashes and confirmed identical inserted values/defaults, exact empty-row INSERT result checks, immediately adjacent same-owner transaction readback with strict id/stringrevision1 before downstream writes. No authority/RLS/Money/rollback or policy/grant/schema weakening. No tests or remote actions repeated; actual PostgreSQL qualification remains required.
