# BUG-008b revised independent security/privacy source review

```yaml
contract: REVIEW/v1
task_id: BUG-008b
reviewer: security-privacy
stage: revised final source, draft PR 237
verdict: APPROVE
findings: []
```

The two MAJOR findings in `security-source-review.md` are resolved: ordinary member INSERT permits only self-bound first ADMIN in an empty household or an identity-less DEPENDANT added by an active admin; accepted, unexpired invitation service policy handles later adult MEMBER inserts. Invitation transitions preserve a previously non-NULL `invitee_id`; NULL binding remains service-only. The previous review remains the finding history.

Type 2a matches DATA_MODEL and ADR-0021: nullable member identity/display name, SQL role-pair CHECK, regenerated baseline and independent fixture. `addDependant` creates no Identity and audits only the member ID; privacy preview excludes identity-less profiles from consent/subscription owner lookups. The PG test asserts multiple dependants, denied non-admin/invalid role pairs, and no dependant account visibility.

Reviewed `0002` command-specific RLS, grants, narrow lookup helpers, owner/authority triggers, invitation/share lifecycle, and ordinary/service LOGIN proof assertions. Dual transaction-local GUC mismatch/missing cases, cross-owner FK/immutable-owner denials, and concurrent READ COMMITTED/REPEATABLE READ charge/admin guards are represented in source. This is source approval only: the owned disposable PostgreSQL 16 proof and exact-head CI remain required; the earlier CI startup failure is unresolved until rerun.

SHA-256 with CRLF normalized to LF: schema `ff76a5afc01a2cb3fdc0c6c051403d8b4061e40a89e2641c8617a4b864c24284`; baseline `ac77ad96094f0dd6f2a832ab77277fdc7b930f7a8dbec7735e74108c9b403167`; privacy SQL `86f779542e62e0ba14669ab37c15e74d2cf9b07fa9b36547b8cb7a3fd0209d73`; PG test `892baadf9416b42aaa190c74ce4b07b4e93c289f393bb40946d9f6de35a74b32`; household service `2494f4e19c7527308f0cde0d42adc4f3cdd46c493d4ab62fd8af2ba897eefdb0`; privacy service `a296cb4d7aece3b2f0bd95d6fafb1339bd4e0456cb5c84e24e87a5b407d4c2f9`. No tests or database operations run for this review.
