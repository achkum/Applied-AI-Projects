# ST249 PostgreSQL qualification independent privacy/source review

2026-10-14. Reviewed final ten-file handoff against base597776129a88ea79308c4478e06f5ea439035618 and frozen fixture/receipt/provisioning plans. All ten SHA256 hashes independently match the handoff. Source review only; no tests repeated, SQL execution, hosted dispatch, credentials, Git or VPS action.

## Verdict: SOURCE HOLD

Three concrete qualification/frozen-controller gaps require correction before source approval and genuine execution.

1. Reciprocal foreign receipt isolation is not actually exercised. private-mobile-detection-proof.ts line68 always submits Alice's confirmed.receiptId. Bob correctly receives404, but the Alice iteration submits Alice's own already consumed receipt and expects409, never Bob's receipt404. Freeze each tuple with the corresponding opposite-owner original receipt (Alice confirmed for Bob; Bob bobReview for Alice), require404 in both directions and preserve full before/after snapshot. Keep consumed-own409 as its separately named test. This is required before detectionOwnerIsolation=true.

2. Both-GUC mismatch checks do not cover all five protected tables. The unknown/empty pair loops query five tables, but line75 actual Alice/Bob mismatch queries only candidate. Run the identical five-table roster under Alice/Bob AND Bob/Alice mismatches, with matching owner positive evidence (real HTTP operations already exist, direct ordinary-role owned-read evidence is preferable). Require snapshot unchanged and rollback. This is required before detectionRlsNegative=true; fixture blanket denial must not stand in for functioning isolation.

3. Armed controller omits frozen resource/cardinality binding. OwnedDetectionController retains armed owner/session only; it drops original candidate/receipt at arm and never verifies target parameter slots at detectionReceiptLock/detectionCandidateLock/final fence. A different same-owner/session target can consume an armed scenario, contrary to the frozen 'non-target request clears/fails' rule. Retain the exact privately persisted armed original candidate/receipt, validate byte-exact named-query parameter slots before fault activation, reject/reset mismatch without ticking or injecting a fault. The observation is currently a fired boolean, so it cannot prove the frozen exactly-once boundary cardinality; add finite per-boundary counts (including explicitly dual expiry/rollback cases) and assert expected counts/order and verified ordinal for the selected scenario. Focused negative tests must cover same owner/session wrong candidate/receipt, repeated boundary, and malformed/missing target slots. Do not accept new caller IDs/SQL/callbacks or expose bindings in diagnostics.

## Preserved acceptable boundaries

The retained disconnect/fresh legitimate connect/sync/scan provisioning amendment is acceptable: one unchanged parent/bank baseline, one cluster/controller with monotonic clock, fresh real review per timing scenario, no owner-written receipt/status reset. Per-case bank/manual equality is captured after legitimate generation setup; final source equality begins after legitimate Bob generation, avoiding false global equality across intended changes.

Receipt source exactly matches nine scalar +21 inherited +31 named detection gates; own descriptors, fixed counts/bounds/enums and no private fields are appropriate. Parent assertion return precedes inherited projection; bank booleans come from successful actual return; flag completion is checked. Projector rejects missing/extra/accessor/prototype/symbol/false values. Cleanup precedes projection/write/PASS, private error logs are not uploaded and only closed failure-phase text is emitted. Receipt is still backend-only acceptance.

Clock begins behind PG wallclock, arm refreshes PG bound and persisted owned immutable deadline, actual super.verify runs first, fourth await/fifth synchronous ordering remains honest. Actual query results are returned unchanged except fixed transport failures; real error release is delegated. No production factory changes/grant widening/raw display/catalogue mutation found in this roster. Source-linked purge remains application RESTRICT. Default-disabled clock still delegates Date.now; parent/bank baselines run first unchanged.

Follow-up review should inspect only these changed areas/new hashes and necessary focused results. Complete fixed source review plus root custody GO remains required before SQL/hosted qualification; no installed native, full ST081, retention/export/training or UF11 acceptance follows from source tests.

## Corrected source final re-review: SOURCE GO

2026-10-14. The three prior holds are resolved. Independently recomputed all ten handoff hashes again; all match. Changed review-bound source:

- private-mobile-owned-fixture-observer.ts: bf838aa700327a90ce0c7fe331ab0a53808720f5a94c308e067feb43fc829211
- private-mobile-detection-proof.ts: 3517ae1816160c79706c03a1d1f323899e2168da46b50a95ce4bee38feabde27
- private-mobile-detection-fixture.spec.ts: adec8f431a1107ed2d5d86d701f7f7aeedc563faf6fee36ca11ff46f56942ac3

Opposite-owner original receipts now receive404 reciprocally with full unchanged snapshot. Both mismatched GUC directions query all five protected tables, both matching-owner contexts have positive reads, negative mutation attempts rollback, and whole detection snapshot equality precedes the measured RLS flag.

Controller retains the exact armed candidate/receipt, validates frozen original/replay receipt lookups, candidate lock, final owner/session fence and review mutation target slots before activation. Wrong/missing/repeated targets clear/reject without ticking or fault success; finite boundary counts/order are compared against the exact scenario roster before flags. Equality advance occurs only after the matching singular actual candidate lock and before the service entry deadline check; actual source then executes final fence/current verification/business guard, so five-verification expectation remains valid. Fourth/fifth verifier timing distinctions remain honest. No caller resource/SQL/callback inputs or private diagnostic fields added.

The refreshed handoff reports27 focused tests with enforced100% controller/projector coverage, types and changed-source lint PASS. These checks were not redundantly rerun here. Other seven hash-bound files retain the previously reviewed loader, default-disabled custody, provisioning, receipt and cleanup boundaries.

SOURCE GO permits the next separately reviewed custody/execution gate. No genuine PostgreSQL receipt, installed native acceptance, production retention/UF11 or full ST081 completion is inferred. No SQL, source code, tests, Git or VPS operations performed during re-review.
