# ST248 backend author handoff

Source branch: `st/native-synthetic-bank` in the managed `native-synthetic-bank` checkout. Author performed no Git commits, hosted dispatch, native run, or merge. Root owns curation/Git. Web source is unchanged.

## Implementation and owned files

- `apps/api/src/banks/private-mobile-bank.ts`: strict private contracts, current verified mobile authority and complete Just-me gate, owner-serialized immutable request receipts, retained-generation read list (max50), fresh immutable reconnect generations, owner/connection-bound opaque server Solberg streams, named durable ingestion store, exact bigint representation bridge, sync/dedup, revoke-retain, atomic purge and replay without resurrection.
- `apps/api/src/banks/private-mobile-bank-statements.ts`: quote-free ordinary named queries plus the exact two independently reviewed ADR0034 purge names/strings. No caller SQL or hidden writable SELECT.
- `apps/api/src/banks/private-mobile-bank.spec.ts`: public workflow, confinement, corruption and dependency-interface fault tests.
- `apps/api/src/auth/mobile-private/durable-mobile-authority.ts` and adjacent test: the two reserved names require exact entire constants; every other DELETE/quote/comment rule stays unchanged; purge execution additionally requires exactly2values, current owner and canonical connection UUIDv4.
- Existing `private-mobile-http.ts` / `private-mobile-server.ts`: additive strict bank routes/named statements only in the explicitly enabled private development graph. Default/public graph is unchanged. Generic uncertainty/fence/FK failures remain INTERNAL_ERROR500; native must reverify/readback, not acknowledge purge.
- `apps/api/prisma/development-auth/016-private-mobile-bank.sql`: immutable retained generations/receipts, owner-only RLS, FORCE RLS on exact5tables, one active Synthetic institution perowner, existing public grants only, restricted private column grant, no cascade/global role/model widening. Paying-subscription/charge dependencies remain RESTRICT.
- `packages/synthetic/src/bank-provider.ts`, `calendar.ts`, adjacent provider test: UTC civil dates, final shifted-window filtering, previous-month candidate inclusion, stable percharge IDs AND RNG across overlapping windows. Existing local calendar exports retained.
- Domain `tsconfig.bank-runtime.json`, Synthetic `tsconfig.runtime-bank.json`, respective package manifests: additive compiled bank/ingestion/provider/persona runtime exports in existing ignored dist directories. Trusted package resolution then file-URL import works from private temp bundles; no loader or pin upgrade.
- API package/lock: only new dependency edge is existing @subtrack/synthetic workspace package. API build/typecheck/test prepare compiled prerequisites.
- Owned native and private-mobile workflow files: bank runtime build prerequisites added; existing acceptance command/gates preserved. Private-mobile workflow still selects parent qualifier until reviewed qualifier GO.

## Qualifier correction and review boundary

Backend/contracts/SQL implementation received independent platform/privacy SOURCE GO (root retains verdict). Actual PostgreSQL/native acceptance has NOT occurred.

`apps/api/test/private-mobile-owned-fixture.ts` adds:

- A fixture-only zero-argument fixed Bob helper. It derives a fresh binding through existing development person and mobile-subject verifier classes using the verified RAM key portfolio; provisions only that verified binding through existing identity-provisioner/runtime roles; then uses the existing graph.sessions.verifyLogin('bob') and normal session core. No client actor/persona selector, fabricated identity/session/signature, credential transport or production auth change.
- A fenced owner-specific bank/generation/immutable receipt observer returning only counts/digests, never raw values.

`private-mobile-bank-proof.ts` performs actual strict API calls for Bob profile/JustMe, confirms distinct valid owners, reciprocal foreign sync/revoke/purge409, and checks BOTH target/actor bank+receipt snapshots and manual digest after EACH denial. Bob's own connect/sync/purge/logout is positive. Alice's read remains equal to its prior positive read. Random-GUC five-table RLS negatives remain separately labelled. Final live readback requires2identities/2complete profiles/2JustMe/1manual subscription after the original parent proof already qualified its original one-owner counts.

The bank proof also covers overlapping sync/dedup, API restart, retained visibility after reconnect, immutable replay/body conflict, concurrent connect convergence, expired existing session denial, linked-charge dependency rollback, before/after COMMIT uncertainty and unchanged manual digest. Actual database execution remains pending.

`private-mobile-bank.integration.ts` executes the original parent proof once, then bank extension. `tools/database/private-mobile-bank-qualify.sh` publishes only closed final counts/flags plus cleanup, with fixed failure phases; no tokens/IDs/rows/logs. `private-mobile-proof.sh` installs SQL016 in the owned qualified fixture.

Bob helper was judged model-preserving by privacy review. Final strengthened per-denial proof delta is awaiting final platform/privacy qualifier GO. Do not select/run hosted qualifier before that GO.

## Actual executed checks

Using the existing pnpm runtime shim, from nested SubTrack:

- `pnpm install --lockfile-only --ignore-scripts`, then `pnpm install --frozen-lockfile`: PASS; workspace edge only, no external pin change.
- Domain/Synthetic `build:bank`: PASS.
- API `typecheck` (including lifecycle/bank/Synthetic runtime prerequisites and existing Prisma generation): PASS.
- API emitted `tsc -p tsconfig.build.json`, then CommonJS private-server graph import smoke: PASS. Later source deltas were independently typechecked; no repeated full runtime run claimed.
- Bank + authority focused tests:35PASS; authority coverage100% statements/lines/functions and100/100branches.
- Synthetic provider focused test:33PASS (including overlap/shifted window/timezone tests).
- Bank + existing private HTTP/server regression files:68PASS at that source handoff.
- Final bank orchestration focused tests:19PASS,100% statements/lines/functions and122/122branches. This is unit/source qualification, not installed app or PostgreSQL acceptance.
- Final Bob helper guard tests (`vitest run test/private-mobile-bank-fixture.spec.ts`):3/3PASS; no DB stand-in acceptance.
- Final API `tsc --noEmit -p tsconfig.json` and targeted ESLint for helper/proof/guard/integration:PASS after strengthened assertions.
- Exact ADR/source purge-literal equality, workflow YAML parse, Git Bash syntax for qualifier/fixture scripts, and scoped diff checks:PASS.

No unchanged full mobile/backend suite or native build was repeated by this author. Coverage output is not a product completion metric and must not be staged as source.

## Remaining ownership/work

Root owns final exact-source review evidence, curation/commit, parent C16 integration, workflow qualifier selection and hosted dispatch. Native installed specialist owns new private-runtime/e2e/native workflow bank acceptance helpers; coordinate the shared native workflow edit. Root owns the reviewed native UI mutation-uncertainty repair. Actual owner bank PostgreSQL journey, installed Android/iOS behavior, durable readback, pixels/cleanup and all parent acceptance gates remain required. No release/delivery/spending/new external accounts authorized.
