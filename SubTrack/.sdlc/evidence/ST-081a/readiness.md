# ST081 pure lifecycle readiness audit

## Finding

A private, pure decision helper for ordinary single-subscription status transitions can be implemented against accepted ADR-0016 semantics without resolving the pending database, migration, authentication, RLS, or retention gates. Its scope must stop at deciding an action/status pair; it must not authorize a caller, load or mutate a subscription, persist receipts/feedback/audit, perform undo or merge, or imply route/API readiness. The helper can be local Type 2b behavior under DECISION_RULES §1, with no new package or dependency.

This does not make ST-081 READY or satisfy any ST-081 delivery slice. ADR-0016 explicitly says it is a bounded contract, not runtime authority, and retains BUG-008, SEC-FU1/RLS/database proof and persistence-retention gates.

## Accepted statuses and transition table

The accepted vocabulary is `DETECTED`, `TRIAL`, `ACTIVE`, `PAUSED`, `CANCELLED`, `ARCHIVED`, and `REJECTED` (DATA_MODEL, OpenAPI Subscription status, Prisma enum and historical SQL enum). ADR-0016 §3 supplies the action mapping:

| Current status | Action | Result |
| --- | --- | --- |
| DETECTED | confirm | ACTIVE |
| DETECTED | reject | REJECTED |
| DETECTED | archive | ARCHIVED |
| TRIAL | activate | ACTIVE |
| TRIAL | cancel | CANCELLED |
| TRIAL | archive | ARCHIVED |
| ACTIVE | pause | PAUSED |
| ACTIVE | cancel | CANCELLED |
| ACTIVE | archive | ARCHIVED |
| PAUSED | resume | ACTIVE |
| PAUSED | cancel | CANCELLED |
| PAUSED | archive | ARCHIVED |
| CANCELLED | archive | ARCHIVED |
| REJECTED | archive | ARCHIVED |

All other pairs are rejected with `LIFECYCLE_CONFLICT`; `ARCHIVED` has no ordinary outgoing transition. No same-status no-op is successful. `edit` preserves status and is not a status transition. Merge is excluded from this table and helper: the ADR gives it separate two-record DETECTED-only semantics. Missed-charge automation is deferred; this table only models explicit owner-confirmed cancellation.

A narrow internal shape could be `decideSubscriptionTransition(currentStatus, action) -> { kind: 'transition'; nextStatus } | { kind: 'conflict'; code: 'LIFECYCLE_CONFLICT' }`, over closed status/action unions and with no I/O. Keep it private to the eventual owning module; do not add it as a public contract or treat it as proof of current record state.

## Existing definitions and conflicts

- No `apps/api/src/modules/subscriptions` directory exists. The required fallback listing of `apps/api/src` shows no subscription lifecycle module/helper. `packages/domain` has no lifecycle/status decision file; it contains detection, policy and ingestion code, but no equivalent transition mapper. Existing `apps/api/src/data-rights/data-rights.service.ts` only serializes a subscription's stored status for export, not transitions.
- Status vocabulary already exists in `packages/contracts/openapi.yaml` (Subscription schema enum at line 672), `docs/product/DATA_MODEL.md` (subscription row at line 41), `apps/api/prisma/schema.prisma` (`SubscriptionStatus` around line 381), and `apps/api/prisma/migrations/0002_subscription_visibility/migration.sql` (enum around line 27). This confirms status labels only; no permitted transition behavior was found there.
- `docs/product/PRODUCT_SPEC.md` lines 98–101 names review actions and sketches `DETECTED → ACTIVE → (PAUSED) → CANCELLED`, plus TRIAL/ARCHIVED and user-confirmed missed-charge handling. It leaves transition details unspecified; ADR-0016 §3 now provides the precise bounded table and adds REJECTED archival. There is no material conflict with the proposed pure helper when constrained to the ADR table.
- ST-081 contains stale pre-ST205 assumptions/questions: its old `blocked_reason`, earlier architecture pre-review and review question 3 still describe lifecycle semantics as unresolved. Its “Accepted architecture contract update, ST205” section records ADR-0016 as accepted and clarifies that semantics are documented but runtime authority/gates remain absent. Treat ADR-0016 as the current source for the mapping and do not reinterpret those historical task notes as permission to expose routes or persist state.

## Gates and boundary

- **Pure decision logic:** no DB/migration/auth/RLS/retention dependency is needed to compute a result from supplied closed values. DECISION_RULES permits a private local helper as Type 2b. ADR-0016 §3 is the accepted contract for its outputs.
- **Database/migrations:** ST-081 remains blocked on BUG-008 external database inventories and a reconciled migration chain. No schema or migration work is implied by this audit.
- **Authentication/RLS/integration:** ST-081 remains blocked on actual SEC-FU1 trusted-principal/request binding, transaction-scoped RLS behavior, and disposable PostgreSQL mutation/visibility proof. A pure helper establishes none of these.
- **Retention:** ADR-0016 conditions feedback and receipt persistence on an approved retention/deletion contract and minimum prior-state allowlist. A non-persisting transition decision helper does not store either record and does not resolve that condition.

Recommendation: allow only the isolated pure decision helper under ADR-0016 §3 if a bounded implementation task authorizes it. Keep controller registration, lifecycle writes, merge/undo, feedback/receipt storage and all ST-081 readiness claims behind their recorded gates. No repo implementation or tests were performed for this audit.

## Evidence inspected

- `AGENTS.md`, `docs/governance/CONSTITUTION.md`, `docs/governance/DECISION_RULES.md`
- `.sdlc/tasks/ST-081.md`, `.sdlc/tasks/ST-205.md`
- `docs/architecture/adr/ADR-0016.md`
- `docs/product/PRODUCT_SPEC.md`, `docs/product/DATA_MODEL.md`
- `packages/contracts/openapi.yaml`
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/0002_subscription_visibility/migration.sql`
- File discovery under `packages/domain`, `apps/api/src` (fallback because subscriptions module path is absent), and `packages/contracts`; narrow lifecycle/status searches in these areas and named source docs.

## Call accounting

Four shell calls were used, within the four-call limit. The first listed guidance files and read `AGENTS.md`; a command typo ended that call before the planned document reads. Calls two and three read the requested documents and bounded lifecycle/status evidence. Call four wrote this report. No edits outside this report, tests, installs, git operations, network requests, database actions, or implementation were performed.
