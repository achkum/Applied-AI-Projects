# BUG-008b amended-runtime QA review (2026-10-10)
```yaml
contract: QA/v1
task_id: BUG-008b
reviewer: qa-engineer
verdict: FAIL
checked_dod: false
```
Independently executed: focused household/privacy Vitest 20/20; full API Vitest 59 files, 1,207/1,207; API ESLint on changed/test files PASS; API `tsc --noEmit` PASS.
V8 overall API: statements 90.28%, branches 91.38%, functions 96.82%, lines 92.52%.
Changed service sources (households + privacy): statements 118/123 (95.93%), branches 54/62 (87.10%), functions 32/32 (100%), lines 104/109 (95.41%); all exceed 80%.
Author-reported (checkpoint-6, not independently rerun): Prisma migrate diff/generate PASS; diff-check PASS; focused lint/typecheck/20 tests PASS. My independent checks are listed separately above.
Source inspection: test requires fresh-container marker, loopback endpoint, exact runtime `session_user/current_user`, non-superuser/non-owner/non-BYPASSRLS, no SET/extra role, and exercises owner/co-member/unrelated households, share/open-book, dependant inserts, catalogue writes and service LOGINs.
Fixture comparator reads `reconciliation-target.json`; checks expected enums, exact columns/types/nullability for listed tables, expected keys/FKs, selected CHECKs/indexes and RLS-enabled names. It does not assert exact table/enum sets, all fixture checks/index definitions, policy command/expression parity, or grants against fixture; catalog proof is therefore partial.
Actual disposable PostgreSQL 16 execution and exact-head CI remain pending; no database proof is claimed. QA runtime gate remains FAIL pending those runs and complete catalog comparison/evidence.
```
