# ST250 existing PostgreSQL driver runtime classification

2026-10-14. Narrow authorized source change only: move existing pinned `pg`8.23.1 from API devDependencies to dependencies and move its existing three-line lock importer entry accordingly. No new package, version, resolver snapshot, integrity or unrelated lock change. Git diff is1 insertion/1 deletion in package.json and3 insertions/3 deletions in pnpm-lock.yaml. No Git or remote mutation, Docker build, sandbox authority code or real secrets.

Actual checks:
- `pnpm12.6.0 install --lockfile-only --frozen-lockfile --ignore-scripts` PASS across17 workspace projects, including1960-entry supply-chain policy verification. The prior offline attempt failed because local Expo metadata was absent; no false offline success is claimed. Online verification succeeded without lock churn.
- Direct API `tsc --noEmit -p tsconfig.json` PASS exit0. The existing pnpm shim refreshed existing local dependency links/build hooks before compilation; no source/generated output changed by this check.
- Existing installed `pg/package.json` resolves version8.23.1. Manifest and frozen importer now classify that exact pin as production. This is not an isolated production image-install result; image build waits for the reviewed sandbox entrypoint.
- In-memory esbuild bundle/metafile of the existing `private-mobile-server.ts` application graph, with external packages and no output files, has no runtime `@prisma/client` import. Current business/session graph uses raw owner-scoped SQL; its pg type imports erase, while the future real launcher must instantiate actual Pool. Existing unrelated Nest identity-provider service/module import Prisma; they are not pulled into this private graph and must not become a fallback launcher. If the future sandbox main deliberately imports Prisma, copy/qualify generated client and engines in the runtime image before publication; current Dockerfile does not claim that support.
- Scoped whitespace check PASS. All seven infrastructure source hashes remain exactly unchanged from `sandbox-infrastructure-source-handoff.md`.

SHA256:
apps/api/package.json 29b3afd68212325cf13b9d10130931aa912052bc0b55df2e75b1d0e38d5849f5
pnpm-lock.yaml afc1b1afb4710bac3def9d6f03b858b2a8780aa0883339870b800dcce1072996

Independent review of this narrow classification is required before root curates/commits. No persistent backend, public TLS or phone acceptance is inferred. Shared heavy slot released.
