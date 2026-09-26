# SubTrack — Repository Instructions for Coding Agents

This file is read by Codex and any other coding agent working inside `SubTrack/`.

## Before you touch code
1. Read your task file: `.sdlc/tasks/<ID>.md`. Only modify files under its `allowed_paths`.
2. Read `docs/governance/CONSTITUTION.md` (it's short). Every rule in it applies.
3. Read the spec sections the task links to. Do not rely on memory of other projects.

## Commands
```bash
pnpm install                 # from SubTrack/
pnpm check                   # lint + typecheck + unit tests (all packages, via turbo)
pnpm --filter <pkg> test     # one package
pnpm i18n:check              # sv/en key parity
pnpm contracts:gen           # regenerate client/zod from packages/contracts/openapi.yaml
make up / make down / make seed MODE=dev   # docker compose dev stack
cd services/ml && uv run pytest
```

## Conventions (short version; the skills have the details)
- TypeScript strict. No `any` without an `// eslint-disable-next-line` and a reason.
- Money: `packages/money` only, bigint minor units. Never `Number` for money.
- Data access: always through repositories that take a `RequestContext` (userId, householdId). Never query without scope.
- UI: tokens only (`packages/ui-tokens`). A lint rule forbids raw hex, px font sizes and inline colours in apps.
- Strings: `t('key')` only. Add keys to both `sv.json` and `en.json`.
- Errors: throw domain errors and map them to problem+json in the API layer.
- Tests live next to code (`*.spec.ts`), E2E in `e2e/`.
- Commits: `type(scope): summary [ST-123]`.

## Never
- Commit secrets or real personal data. Use `.env.example` placeholders.
- Push to `main` or `subtrack/develop` directly.
- Call Tink, BankID, LLMs or ML from client apps.
- Invent external API fields or endpoints. Verify them against official docs and cite them in the PR.
- Disable or skip tests to get green.
