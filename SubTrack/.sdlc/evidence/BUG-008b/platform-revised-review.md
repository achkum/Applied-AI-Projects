# BUG-008b revised platform source review

```yaml
contract: REVIEW/v1
task_id: BUG-008b
reviewer: architect-platform
stage: revised-source, PR 237
verdict: APPROVE_SOURCE
findings: []
```

Reviewed the frozen working-tree revision based on `f4f6acb473fd60cb0063968299e58cd04f1037ae`, including ADR-0021, Prisma schema, both active migrations, independent fixture, service changes and disposable proof source. This approves source consistency only; PostgreSQL 16 execution, security review, QA/devops review and exact-head CI remain gates.

The nullable member identity and `display_name` match DATA_MODEL and ST-046 AC3. `0002` enforces profile-only DEPENDANT versus identified adult roles; runtime admits only active admins to add dependants and only self-bound first admins to bootstrap. Invited adults remain service-bound. Membership identity and household cannot be retargeted. The service creates no synthetic Identity and audits only the member ID; privacy preview excludes identityless profiles from identity-based lookups. The fixture declares the new exact columns, nullability, enum, foreign key and check, and the PG test probes two profiles plus unauthorized/invalid role pairs.

The revised invitation trigger preserves an already bound invitee ID. The previously reviewed command-specific RLS, narrow lookup grants/functions, owner FKs, immutability triggers and last-admin guard remain present. The active chain is `0001` plus `0002`; no existing database migration is asserted.

Prisma 6.19.2 `migrate diff --from-empty --to-schema-datamodel=prisma/schema.prisma --script` exited 0; its body equals `0001` after LF and terminal-newline normalization. Header source hash `884294a60387ded7f6940703e7bf4b8b359c28e220525129c925faee0ce82919` is the raw CRLF schema SHA-256; LF-normalized schema is `ff76a5afc01a2cb3fdc0c6c051403d8b4061e40a89e2641c8617a4b864c24284`. Generated body SHA-256 is `0fefb858837af7d4483daea624081337582ad22655caa3cc144c9db1e7b676fa`.

LF SHA-256: `0001` `ac77ad96094f0dd6f2a832ab77277fdc7b930f7a8dbec7735e74108c9b403167`; `0002` `86f779542e62e0ba14669ab37c15e74d2cf9b07fa9b36547b8cb7a3fd0209d73`; fixture `cc255303c5294927b04de2671ec80a846bbdc2c9b622257fb313ca79acb60e60`. `git diff --check` showed no whitespace errors. The fixture's catalog assertions check exact columns/types/nullability and FK column definitions, while actual PG results are still pending.
