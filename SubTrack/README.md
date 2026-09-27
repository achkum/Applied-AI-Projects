# SubTrack

SubTrack is a pnpm/Turborepo workspace. Product, architecture, governance, and operating documentation is indexed in [docs/README.md](docs/README.md). Historical standalone prototype code and planning material are preserved in [_legacy/](./_legacy/).

## Workspace setup

Use Node.js 20 or newer and pnpm 12. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm format:check
```

The workspace covers `apps/*`, `packages/*`, and `services/*`. TypeScript packages inherit the strict shared preset in `packages/config/tsconfig.preset.json`. The root ESLint configuration loads `@subtrack/config/eslint`; its default-deny relative-import boundaries allow clients only their own layer plus config, contracts, i18n, UI and tokens, and keep domain/money free of I/O layers and external modules. Static `@subtrack/*` imports and re-exports in web/mobile are also default-denied unless the package is on that client's allowlist, including aliases added in the future. Dynamic `import()` and `require()` are outside this scaffold lint guarantee; application tasks must not use them to cross these boundaries. Turbo runs each package's `lint`, `typecheck`, and `test` after its workspace dependencies' `build` tasks.

`packages/config` contains tooling code and web/mobile contain TSX compile fixtures, so their lint scripts run ESLint. Packages without code retain explicit no-op scripts; implementation tasks must replace them when adding code. `services/ml` is a Python service whose future checks will use uv/pytest; its pnpm manifest exists to make the workspace layout complete.
