# ST-216 independent platform source review 1

Status: **CHANGES REQUESTED (conditional, source still moving)**. Reviewed working tree at committed HEAD `82929c4ea049741c018abc23f978e629faf65e2f`; the ST-216 runtime, proof, and workflow files were untracked at review. This is a source review, not an actual-PG, coverage, CI, or exact-final-head PASS.

## Findings

1. **P1 — Standalone listener can bind after its startup deadline and cleanup.** `subscription-lifecycle.local.ts` awaits `deadline(composition.listen(port), 10_000)`. The deadline races `app.listen`, but neither cancels that listen nor arranges a late close. If the bind promise settles after the 10-second rejection, `main` closes the app and disconnects Prisma while a late listener may still appear. Add a late-settlement close or abort/settle pattern, and exercise it with a deterministic test. This is required by ADR-0024's bounded startup/late-close and listener-gone boundary.

2. **P1 — Required provenance negative proof is incomplete.** The actual Node integration test exercises missing provenance, forged CID, stale creation time, mismatched credential, and wrong database, but does not exercise wrong Docker label/image/mount/port/binding, nor URL role/port mismatch. `subscription-lifecycle.local.spec.ts` is absent. ADR-0024 and the QA matrix explicitly require four isolated negative classes including the Docker ownership geometry. Add focused `assertOwnedFixture` tests for those classes and keep the direct Node credential mismatch. This is a verification gap; I did not find a proven bypass in the current predicate.

3. **P2 — Direct standalone shutdown does not prove the pool disconnected.** The integration test checks exit code and refused HTTP after SIGTERM/SIGINT. That proves listener exit, but it does not inspect the runtime role's `pg_stat_activity` after each child exits. The contract asks for listener closure *and* Prisma disconnect; add a bounded check for absence of the child's database connections after each signal. The wrapper's exact-CID and private-directory cleanup checks remain separate.

The main architecture is aligned: an isolated loopback graph registers the existing `AuthenticatedPrincipalGuard` globally; resolver/session reader, read routes, and private writer share the injected ordinary-role Prisma pool; the HTTP route selects action only from target and delegates locked-pair authority to the writer; the global filter projects bounded RFC9457 status/code bodies. The wrapper records a fresh CID/label before starting Docker, uses a sole tmpfs PG16 container, and emits PASS only after cleanup. This alignment is conditional on final source and real execution evidence.

## Source pin

The following normalized Git blob IDs are in path order: controller `f2d8f4ca`, service `955f6d00`, composition `ef77e663`, direct entry `5ad514db`, controller spec `cb5806f7`, service spec `a212bd0a`, composition spec `2eb27f72`, actual-PG HTTP integration `fa61b380`, Vitest config `b8e6d822`, proof wrapper `19e35420`, workflow `ffee78da`. Full IDs are in the review command output; this prefix pin is provisional because authors are editing in parallel.

No local tests were run in this review. Final approval requires refreshed exact-head inspection, fixed findings, actual-PG proof, changed-runtime coverage, and the prescribed lint/typecheck/regression/build/CI receipts.
