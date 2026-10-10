# ST-221 QA report (2026-10-10)

Contract: QA/v1
Task: ST-221 — Isolated loopback HTTPS browser subscription read composition
Verdict: **PASS for ST-221 composition scope**

## Evidence

- Full API regression: from `SubTrack/`, `corepack pnpm --filter @subtrack/api test` — **72 test files passed, 1,454 tests passed, exit 0**. Sanitized summary only; raw output is retained in `SubTrack/.sdlc/evidence/ST-221/ST221qa-full-api.log` for audit and contains transient development OTP output, so it must not be copied into reports or committed.
- Focused composition suite, lint, and TypeScript results: author reports 39/39 tests passed, ESLint passed, and API `tsc --noEmit -p tsconfig.json` passed in `author-handoff.md`; the platform and security reviewers inspected the same frozen source and spec and approved them. I did not repeat focused/lint/typecheck jobs.
- Latest available focused coverage artifact for the exact runtime (`apps/api/coverage/clover.xml`, generated 2026-10-10 22:07) reports 85/86 covered statements, 79/82 covered conditionals, and 28/34 covered methods. The associated V8 author report records 92.68% statements (114/123), 96.34% branches (79/82), 82.35% functions (28/34), and 98.83% lines (85/86). The full API regression does not enable coverage, so it did not produce a newer coverage run.
- Frozen source identity unchanged after QA: runtime blob `e838495b26bef3ac68f491cf7391373e008e1ac6`; spec blob `8caf0113d12ac0fb119c7fa160c58dfa8ca6a857`.

## DoD assessment

- Composition behavior is supported by focused test evidence and independent platform/security approvals: private explicit graph, same injected pool for preflight and scoped repository reads, accepted v2 auth ports, direct loopback HTTPS preconditions, parser error mapping, and bounded startup/cleanup behavior.
- No feature defect was observed in the full API regression. The task acceptance criteria for the isolated source composition are met based on the focused test report and frozen-source reviews.
- **Scope limit:** this does not demonstrate actual browser execution, owned PostgreSQL fixture provenance, durable account/session behavior, or user-facing UI activation. Those remain ST-222. Exact-head applicable CI and integration/merge gates remain pending the Conductor.

No defects filed.
