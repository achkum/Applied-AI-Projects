# ST250 coherent pnpm12 launcher substrate patch proposal

2026-10-14 read-only audit after actual pre-SQL install failure. No wider source edits authorized/performed. One-file sandbox PG workflow repair is implemented separately and awaits independent root review. Preserve pnpm12.6.0, current Node matrix, lock/dependency versions, all tests/assertions/authority/CI applicability.

Corepack's obsolete bin/pnpm.cjs assumption affects explicit corepack pnpm launches, including nested API scripts even when the outer CI uses direct pnpm. Proposed exact primary patch roster21 paths:

- `SubTrack/apps/api/package.json` (only build/typecheck/test script prefix substitutions)
- `.github/workflows/subtrack-private-mobile-proof.yml`
- `.github/workflows/subtrack-browser-subscription-read-proof.yml`
- `.github/workflows/subtrack-clean-migration-proof.yml`
- `.github/workflows/subtrack-browser-subscription-lifecycle-launcher-proof.yml`
- `.github/workflows/subtrack-session-owner-proof.yml`
- `.github/workflows/subtrack-development-auth-foundation-proof.yml`
- `.github/workflows/subtrack-subscription-read-proof.yml`
- `.github/workflows/subtrack-subscription-lifecycle-http-proof.yml`
- `.github/workflows/subtrack-subscription-lifecycle-proof.yml`
- `.github/workflows/subtrack-private-https-profile-proof.yml`
- `.github/workflows/subtrack-native-device-proof.yml`
- `SubTrack/tools/browser/private-https-preflight.sh`
- `SubTrack/tools/auth/session-owner-rls-proof.sh`
- `SubTrack/tools/database/browser-subscription-lifecycle-launcher-proof.sh`
- `SubTrack/tools/database/clean-migration-proof.sh`
- `SubTrack/tools/database/browser-subscription-read-proof.sh`
- `SubTrack/tools/database/test-browser-subscription-lifecycle-launcher-proof.sh`
- `SubTrack/tools/database/subscription-lifecycle-proof.sh`
- `SubTrack/tools/database/subscription-read-proof.sh`
- `SubTrack/tools/database/subscription-lifecycle-http-proof.sh`

Each applicable workflow installs pinned pnpm with npm global and verifies exact version after Node setup, then invokes direct pnpm. Jobs currently having no installation step receive the same explicit setup; private/native workflow multiline corepack enable is replaced. Existing shell launchers switch only corepack pnpm→pnpm, preserving all private URL quoting/bounds/custody/diagnostics and mandatory checks. The embedded negative-test command stub is renamed corepack→pnpm to exercise the actual launcher and preserve its negative acceptance behavior. API script prefixes switch only, keeping every domain/Synthetic/Prisma/compiler/Vitest step and order.

After the SDK54 branch is integrated, its new `.github/workflows/subtrack-sandbox-build.yml` requires the same small explicit pinned-install/direct-pnpm correction (22nd path). Apply SDK native workflow repair only after root reconciles its newer reviewed source, avoiding overwriting toolchain changes. No web product development is proposed: these existing shared gates remain applicable as previously agreed.

`subtrack-ci.yml` already uses pnpm/action-setup12.6.0 and direct pnpm; no observed failure establishes an action-setup defect. API nested script correction repairs that pipeline's explicit Corepack use. Do not rewrite its license/quality gates or disable workflows. API/web/sandbox Dockerfiles already install pnpm globally; COREPACK_HOME alone in the web Dockerfile is unused launcher metadata, not evidence requiring a source change. Domain/Synthetic scripts invoke tsc/Node directly and need no edits. No broad dependency reinstall, lock rewrite or unchanged application test repetition follows from this patch.

Before implementation: root freeze exact paths, independent plan review. Validate YAML command shape, JSON unchanged dependency objects, shell syntax and the existing meaningful affected launcher negative tests; actual new-head applicable CI supplies runner evidence. Missing qualification never becomes an exception to CI or production security.
