# ST205 Privacy/Security Review

**Verdict: APPROVE the bounded, reversible contract decisions in this draft only.** This is not approval to implement, expose routes, alter schemas, delete data, or claim end-to-end security. The proposal retains the existing trust and privacy boundaries and keeps unresolved evidence and retention gates explicit.

## Basis and scope

Reviewed `.setup/ST205-subscription-contract-plan.md` against the specified repository governance, ST-081/BUG-013, product F5 and UF-06/UF-08, DATA_MODEL, and API_CONTRACT inputs. ST-081 remains BLOCKED. This review grants no implementation authority and does not certify runtime behavior.

The draft’s key constraints align with the Constitution and product model: raw transactions remain owner-only; household visibility is read-only and cannot grant access to review, feedback, or charge details; the caller principal comes from trusted current authentication; both accepted RLS setting names receive the same immutable principal snapshot; and mock evidence is not presented as PostgreSQL RLS proof. The proposed receipt, merge link, feedback correction, and undo behavior is additive and compensating, preserving audit/evidence rather than deleting it. The four labels distinguish binary classifier truth from edit/merge events, and only current non-undone binary feedback is eligible for later authorized training.

## Findings

| Severity | Finding | Disposition / gate |
|---|---|---|
| **BLOCKER (privacy)** | Feedback persistence, export, and training lack an approved bounded retention/deletion contract. The draft correctly refuses to choose a duration and marks these uses BLOCKED. Product F11/UF-11 account deletion obligations also mean “append-only” cannot be interpreted as an exemption from approved erasure rules. | Keep feedback persistence and any export/training blocked until an explicit retention, correction, deletion/erasure, and training eligibility contract is approved and security reviewed. Preserve audit evidence only as permitted by that contract. Do not silently treat audit immutability as permission for indefinite personal-data retention. |
| **HIGH (implementation security gate)** | Owner checks, current-auth checks before idempotency replay, owner-only mutation/feedback/charges, and dual-key RLS binding are contract statements; they are not verified runtime controls here. BUG-013 explicitly says its accepted helper review did not establish live PostgreSQL RLS/authentication. | Before route/schema implementation or readiness, complete SEC-FU1 trusted-principal binding and test on reconciled disposable PostgreSQL using a qualified non-superuser, non-`BYPASSRLS` role. Prove owner/peer/household boundaries for reads and mutations, both RLS keys, rollback and concurrency. Mocks alone do not satisfy the gate. |
| **MEDIUM (data minimization)** | The receipt says it captures the “minimum approved prior state,” but the precise allowlist is not defined. A prior state could contain display or financial data beyond what undo needs. | At implementation-contract time, enumerate only fields necessary to compensate the action; exclude raw transaction data, account identifiers, credentials, and unnecessary snapshots. Apply the approved receipt retention rule. |
| **MEDIUM (identity-link handling)** | The append-only merge link contains two subscription IDs and may resolve identities after merge. The plan limits it to owner-only resolution and forbids cross-owner/raw-transaction access, which is sound, but link access must remain independently owner-scoped even when survivor records are household-visible. | Keep the link and its endpoint/query path under owner checks and RLS; test a household-visible survivor against a non-owner attempting source/link or associated charge access. No cross-owner merge or charge reassignment is approved. |
| **LOW (scope clarity)** | The four-label set is intentionally minimal and distinguishes binary truth from review events. “Eligible for later authorized training” must not be read as present authorization for export, model ingestion, or cross-user aggregation. | Preserve the explicit training block pending retention/purpose review and separate authorization. No broader training permission is granted by this review. |

## Contract decisions approved within scope

- Owner-only confirm/reject/edit/merge/undo, feedback, charge details, and replay responses; current authentication and target ownership/access are checked before replay. A caller-supplied key is never authority.
- Household visibility remains read-only and does not reveal raw transactions, feedback, merge-linked source data, or owner-only charge details.
- Undo is time-bounded, version-checked, single-use, and implemented as a compensating event. Expiration, revision conflicts, and duplicate/concurrent actions fail closed; evidence is not deleted.
- Merge is limited to distinct same-owner DETECTED records with no amount sum, reassignment, cross-owner access, or automatic binary-feedback rewrite.
- The four minimal labels and rule that only current, non-undone binary labels may be considered for future authorized training.
- Preserve BUG-013’s already accepted identical dual-key binding of one immutable verified principal. This accepts compatibility with the existing helper contract only; it does not prove database policies or authorize routes.
- The draft does not authorize retention durations, storage/schema, deletion behavior, providers, public endpoints, or deployment.

## Missing gates and limits

1. ST-081 prerequisites remain: BUG-008 migration-chain reconciliation; SEC-FU1 actual trusted request binding; and disposable PostgreSQL mutation/RLS proof. The proposed delivery split is reasonable, but does not remove either slice’s prerequisites.
2. For review/feedback slice B, approve a bounded retention/deletion/export/training contract before feedback persistence. Reconcile it with UF-11 hard deletion within 30 days and the policy for pseudonymous audit records.
3. Test current-auth-before-replay and authorization isolation for owner, peer, household visibility on/off, explicit shares, `always_private`, source/survivor merge identities, transaction associations, and feedback IDs; include races, rollback, and undo revision conflicts on the real disposable DB.
4. No review of migrations, schema, routes, implementation, provider integration, public/production use, or deletion implementation was performed or authorized.

## Review call log and failures

- Shell calls: **5** total; each `exec_command` used `sandbox_permissions: require_escalated`. The first enumerated workspace files; the second attempted `find ..` and was noisy because it traversed system directories, producing permission-denied errors outside the workspace. It did locate ST205 artifacts and repository `AGENTS.md`.
- Third call read the draft, dispatch records, and `AGENTS.md` successfully.
- Fourth call read the named governance and task files plus two incorrectly assumed product paths. Most output was truncated by the command token cap; `docs/architecture/DATA_MODEL.md` and `docs/api/API_CONTRACT.md` did not exist at those paths.
- Fifth call resolved the actual `docs/product/DATA_MODEL.md` and `docs/product/API_CONTRACT.md` paths and extracted their relevant privacy/RLS/API rules plus BUG-013 acceptance evidence successfully. No further source read was needed.
- No git, tests, install, network, database, secrets scan, or repository edits were performed. The sole write is this review artifact.
