# ST205 independent platform/data architecture review

Verdict: **APPROVE, scoped to the proposed private contract and delivery split only.** This does not approve ST-081 readiness, implementation, storage, route/schema changes, or retention policy. The draft appropriately says that feedback persistence and export/training remain blocked pending an approved bounded retention/deletion contract. Review question 5 therefore remains unresolved; do not report all eight questions resolved or mark ST-081 READY.

## Findings

- **BLOCKER — privacy/retention gate (unresolved by design).** No reviewed source establishes a feedback or receipt retention duration/deletion job. The proposal correctly avoids inventing one and makes feedback persistence/export/training conditional on a separate approved contract and security review. Keep B and any feedback persistence blocked until then; also define receipt/audit retention and deletion treatment before schema/storage design. This is a prerequisite, not an objection to documenting the proposed semantics.
- **BLOCKER — existing ST-081 prerequisites.** ST-080, BUG-008 migration reconciliation, SEC-FU1 trusted-principal binding, and disposable PostgreSQL RLS/mutation proof remain prerequisites for both slices. BUG-013 establishes the accepted transaction-local dual-key compatibility behavior using one captured RequestContext.userId for app.user_id and app.current_user_id; its mocks do not prove live RLS. The draft preserves this distinction and does not treat BUG-013 as end-to-end proof.
- **No further platform/data conflicts found in the bounded proposal.** The draft's source (/id), survivor (mergeWith) merge direction is explicit, owner-only, same-currency, DETECTED-only, preserves original associations/evidence, and rejects unsafe implicit consolidation. Its transition table is conservative and F5-compatible; missed-charge automation is deferred without inventing cadence arithmetic. Undo is a time-bounded compensating event with version checks and current authorization on replay. Idempotency has scoped keys, canonical payload digest, atomic persistence, concurrency serialization, conflict and replay rules, and makes no external exactly-once claim. The money wire representation is canonical base-10 minor-unit strings with Money-layer field validation, without Number conversion. The A/B split matches ST-081's proposed bounded delivery split.

## Required status language

Treat the eight questions as seven contract decisions concretely proposed plus feedback retention/deletion unresolved (with the dual RLS setting question answered by accepted BUG-013 compatibility). Record the retention gate explicitly in any handoff. Do not describe all eight as fully resolved or claim ST-081 READY.

## Review scope and tool accounting

Read-only review of the assigned draft, AGENTS/governance rules, ST-081, BUG-013, PRODUCT_SPEC F5, UF-06/UF-08, DATA_MODEL, and API_CONTRACT. No repository/runtime/database changes, tests, network, git, or setup-skill reads.

Underlying calls: 3 shell reads; 1 shell write (this report); total 4. No tool failures.
