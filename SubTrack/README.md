# SubTrack

SubTrack is a pnpm/Turborepo workspace. Product, architecture, governance, and operating documentation is indexed in [docs/README.md](docs/README.md). Historical standalone prototype code and planning material are preserved in [_legacy/](./_legacy/).

## Workspace setup

Use Node.js 20 or newer and pnpm 12. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm format:check
```

The workspace covers `apps/*`, `packages/*`, and `services/*`. TypeScript packages inherit the strict shared preset in `packages/config/tsconfig.preset.json`. The root ESLint configuration loads `@subtrack/config/eslint`; its boundaries rule rejects domain/money imports from apps or services and app imports from services. Turbo runs each package's `lint`, `typecheck`, and `test` after its workspace dependencies' `build` tasks.

Only `packages/config` contains implemented code at this scaffold stage. Every other package's `build`, `lint`, `typecheck`, and `test` script is an explicit no-op that announces itself; the implementation task for each package must replace those scripts when it adds code. `services/ml` is a Python service whose future checks will use uv/pytest; its pnpm manifest exists to make the workspace layout complete.
