# BUG-008b independent platform source review

```yaml
contract: REVIEW/v1
task_id: BUG-008b
reviewer: architect-platform
verdict: APPROVE_SOURCE
findings: []
```

Reviewed PR #237 at `f4f6acb473fd60cb0063968299e58cd04f1037ae` against accepted main `f372fa5`; this approves the frozen source only. Actual PostgreSQL 16 proof, security source review, QA/devops review and exact-head CI remain required. I did not run tests, connect to a database or change implementation source.

Seven archived migration files are 100% Git renames. The active chain has only `0001_canonical_schema` and `0002_privacy_constraints`; Phase A schema and fixture have no diff. The generated baseline body SHA-256 is `4a4849b4010c4e6ff55dfc5db42958839c1a7d6471fbe56441bd1a644c57f50b`, matching its header. The old session proof changes only its archive path and description; its pinned fixture hashes and assertions remain.

The SQL retains identity, session, household, invitation, OTP, audit, banking, catalogue, subscription, share and charge tables. Composite owner FKs and owner-immutability triggers protect bank/account/transaction/subscription/charge links. Captured charge fields match the signed source amount, currency and transaction date; source-row locking and the linked-row guard cover concurrent edits. Confidence, nullable pairs and active share uniqueness have SQL constraints.

Runtime RLS is command-specific. Banking and charge detail stay owner-only; catalogue writes and OTP stay in separate roles; audit has owner SELECT/actor INSERT only. Share creation requires owner plus active target membership, while revocation remains possible after departure. Subscription SELECT matches the accepted owner/explicit-share/open-book rules, including deliberate sharing of an always-private row. The lookup role has only column reads and Boolean definer functions, with fixed search paths, no runtime membership and no public EXECUTE. Empty-household bootstrap and first-admin constraint avoid a committed ownerless household; invitation service and identity provisioning have separate role policies.

The proof uses an owned disposable container, migration ledger hashes, a Prisma drift allowlist, ordinary LOGIN roles, catalog checks, mutation and context cases, and deterministic two-LOGIN races at READ COMMITTED and REPEATABLE READ. Its fixture comparison checks key/FK columns and selected SQL-only objects; QA should inspect the actual catalog receipt and behavioral results before treating the broader fixture prose as proven. Source hashes below normalize CRLF to LF; the checked-out files have CRLF endings.

| Source | LF SHA-256 |
| --- | --- |
| `0001_canonical_schema/migration.sql` | `462391fec9ad2846508b35ad1a172ec46e9eacb652faffb66d33d46d773a9fad` |
| `0002_privacy_constraints/migration.sql` | `0a99c5cc760315f887a89e0e8dc792857d98b6e3bd04a687dc7a9321e7864ace` |
| `clean-migration-rls.integration.ts` | `b20ecf7af25782a9044618a9f9efe24f5ea6a35a84bddb6079659c48df957d09` |
| `clean-migration-proof.sh` | `1a768712c573d20bc3867c8be2405313936fbe31958fb59455e1ad10ba7ece5f` |
