# ST-212 phase-1 security/privacy readiness
Verdict: REQUEST_CHANGES (readiness only; runtime and PostgreSQL proof have not been reviewed).
Source: OpenAPI blob `70bf060e85e21eb14488b5ac20042ea944d91c5d`; task blob `630fe01ec5c2015a76d14c1216d586dc45437f2c` (`git hash-object`, not SHA-256); base HEAD `70d7fbbf8e56ce6e468947f1640ae8a989b6f5b7`.
Major: `apps/api/prisma/migrations/0002_privacy_constraints/migration.sql:235-253,332` permits an active peer to SELECT shared/open_book subscriptions regardless of `status`; its lookup grant omits `status` (line 177). RLS therefore does **not** enforce the draft's owner-only DETECTED rule.
The contract correctly excludes DETECTED from `SubscriptionPeerView` (`packages/contracts/openapi.yaml:790-792,821-835`) and says peer DETECTED is hidden (`:262-263`), but `ST-212.md` plan items 4, 6, 9, 15 do not state the mandatory read-layer predicate.
Minimum fix before runtime: in `.sdlc/tasks/ST-212.md` plan, require list **and detail** to filter `DETECTED` unless `subscription.identity_id` equals the verified principal, inside the scoped SQL query before keyset pagination/`limit+1`; make the review inbox `identity_id = principal AND status = DETECTED`. Keep the migration unchanged.
Prove peer share/open_book DETECTED absence in list, detail (identical missing/invisible 404), cursors and `nextCursor`; owner DETECTED remains visible, including in the owner-only inbox. Revocation between pages must re-evaluate visibility.
Also make explicit that `scope=household` restricts even owned rows to a caller's active household route; base RLS owner access is unconditional, so RLS alone cannot implement that filter (`migration.sql:239`).
The owner/peer projection allowlists otherwise exclude bank/account IDs, raw transactions and detection evidence; review reason codes match `packages/domain/detection/types.ts:32-39`, with params excluded. Amount strings, bounded cursors, no counts, and generic detail 404 are suitable contract boundaries.
The accepted guard→resolver→real current-session reader and `withRequestTransaction` bind a trusted identity and both matching GUCs (`apps/api/src/auth/sessions/*`, `apps/api/src/database/request-transaction.ts`). Their prior storage proof is not a substitute for ST-212's test-only HTTP composition and ordinary nonowner/non-BYPASSRLS PG16 proof.
No retention, receipt, feedback, default registration, production issuer/provider, or write behavior is approved by this readiness review. Parent BUG-008b PR237 remains an unmerged development dependency.

## Revised phase-1 check
Verdict: APPROVE_READINESS for the reviewed contract and plan only; the earlier REQUEST_CHANGES finding is resolved.
Revised blobs: OpenAPI `342c235ea78dc9b32cb74e578ffa3a5ddafc0aaa`; task `14baa8c6bedb5466d6063c1888edd03e1d24e0a1` (`git hash-object`).
SHA-256: OpenAPI raw CRLF `7ad488c7187ba7f5050e50af95716d472d276d2b0c5b1c0baff3f2769edf74f1`; normalized LF `7755b5ddc8d4916c895ed07cd50cb773186f6312d5d7c4b72dda9192fa14d931`; task LF `7912b49c39aaed7126ea83ed339ca6dfb61cbdd86b673055ed17512676207360`.
`ST-212.md:47,50-53,59` now requires active-household routing for owned rows, owner-or-non-DETECTED SQL list/detail predicates before pagination, owner+DETECTED inbox, and endpoint/filter-bound cursors; OpenAPI `:256-267,295-297,324-330,1301-1310` agrees.
Runtime, exact-source implementation review and ordinary non-BYPASSRLS PG16 HTTP proof remain required before merge; no default registration or writes are approved.
