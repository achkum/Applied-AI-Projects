# ST-236 C4 currency type correction author receipt

Conductor's narrow Type2b source GO was applied to SQL010 and its existing integration only. `public.identity_profile.default_currency` now uses `pg_catalog.bpchar(3)` in place of invalid `pg_catalog.char(3)`. The `SEK` default, constraint, profile rights, RLS, and other SQL declarations are unchanged. The integration's `catalog()` now requires the exact `bpchar` type and typmod 7 before the existing graph proof checks the stored `SEK` default.

The primary PG16 diagnosis and C3 failure limits are recorded in [c3-sql-syntax-diagnosis.md](c3-sql-syntax-diagnosis.md). The bounded C3 `42601` does not prove the first failing SQL statement. No local qualified PG16 fixture was available to this author; the root's next exact-head actual PG16 proof is the execution gate. A PG18 parser-only result would establish grammar acceptance but would not prove PG16 type semantics, so none is claimed here.

Local verification: the existing Node-target esbuild integration bundle passed with esbuild 0.28.2. `corepack pnpm exec eslint apps/api/test/durable-development-enrollment.integration.ts` and `git diff --check` passed. The tracked source diff is one SQL replacement and five integration assertion lines. No full tests or local PG16 execution were run.
