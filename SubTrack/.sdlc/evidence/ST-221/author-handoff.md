# ST-221 author handoff (2026-10-10)

Contract: HANDOFF/v1. Author implementation is ready for independent platform/security source review and QA. Task integration remains pending those reviews, QA, applicable CI and Conductor commit/PR.

## Frozen source manifest

- Plan `composition-plan.md`: Git blob `64834802aef8dceef030c596b43de1fbd52c8229` (independently plan-approved; unchanged).
- Runtime `apps/api/src/subscriptions/browser-subscription-read.composition.ts`: Git blob `e838495b26bef3ac68f491cf7391373e008e1ac6`.
- Spec `apps/api/src/subscriptions/browser-subscription-read.composition.spec.ts`: Git blob `8caf0113d12ac0fb119c7fa160c58dfa8ca6a857`.
- Branch `st/ST-221-isolated-browser-read-composition`, base accepted main `34502431`; source/spec are untracked pending Conductor commit.

## Implementation and proof

Private factory validates explicit development loopback HTTPS/TLS options, checks fixture role and table privileges on the injected pool before Nest creation, then composes the accepted v2 browser read adapter with a `SubscriptionReadService` and scoped `SubscriptionReadRepository` on that same pool. It exposes only bounded `listen()` and idempotent `close()`, with no raw Nest app escape. Caller remains responsible for its injected pool, auth ports and TLS disposal. Parser and framework errors are masked into fixed no-store problem responses. No default graph, accepted adapter, contract, schema, dependency, or auth core was edited.

Focused Vitest: 39/39 PASS. Changed runtime V8 coverage: statements 92.68% (114/123), branches 96.34% (79/82), functions 82.35% (28/34), lines 98.83% (85/86). Focused ESLint PASS; API `tsc --noEmit -p tsconfig.json` PASS. Tests include actual Nest HTTPS loopback parser failures with synthetic in-memory OpenSSL TLS, preflight rejection before Nest, scoped transaction and both user GUC writes, late create/init/listen cleanup, and a real loopback socket that binds late and is freed for reuse.

Commands from `SubTrack/apps/api`: `corepack pnpm exec vitest run src/subscriptions/browser-subscription-read.composition.spec.ts --coverage --coverage.include=src/subscriptions/browser-subscription-read.composition.ts`; `corepack pnpm exec eslint src/subscriptions/browser-subscription-read.composition.ts src/subscriptions/browser-subscription-read.composition.spec.ts`; `corepack pnpm exec tsc --noEmit -p tsconfig.json`.

Actual owned PostgreSQL and browser proof is ST-222; this source and synthetic composition test do not establish fixture provenance or a user-facing flow. Full API regression, independent reviews, CI and PR gate audit are Conductor/QA next steps. Preserve unrelated existing receipts, coverage and generated CRLF fixture in this shared worktree.
