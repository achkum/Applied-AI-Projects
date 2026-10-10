# ST051d Windows Expo Web entry fix handoff — 2026-10-10

## Change

Expo SDK 51.0.39 resolved `main: "expo-router/entry"` to the real pnpm virtual-store path under `node_modules/.pnpm`. Its Metro URL rewrite computes the bundle pathname with Node's Windows `path.relative`, leaving backslashes in the path; the browser request encoded those as `%5C` and Metro returned 404. The Expo Router entry guidance supports a project-local custom entry. `apps/mobile/index.js` now imports `expo-router/entry`, and `apps/mobile/package.json` selects that local entry. The existing Metro workspace-root, resolver and asset-registry configuration is unchanged.

## Verification

- Installed runtime inspected: Expo 51.0.39, Expo Router 3.5.24, Expo CLI 0.18.31.
- Called the installed SDK's `@expo/config/paths.resolveEntryPoint` for web after the change. It resolves to `apps/mobile/index.js` with relative entry `index.js`, removing the pnpm virtual-store path from the entry URL.
- `apps/mobile/package.json` parses successfully.
- Actual Metro/browser startup and route assertions are pending independent QA rerun. This handoff does not claim runtime or route acceptance.

## Follow-up diagnosis — 2026-10-10

The independent rerun after the local entry change requested `/index.bundle` and still received 404. The installed Expo SDK 51 `@expo/metro-config` sources explain the remaining mismatch: the CLI's `getServerRoot()` uses `find-yarn-workspace-root`, while this pnpm workspace is declared in `pnpm-workspace.yaml` and the root `package.json` has no Yarn `workspaces` field. CLI URL rewriting therefore uses the app directory as its server root. The prior custom Metro block overrode `server.unstable_serverRoot` with the monorepo root and set `_expoRelativeProjectRoot` to `apps\\mobile`.

Removed only those two overrides. The app-root default now matches Expo CLI's `/index.bundle` URL, while `watchFolders`, `resolver.nodeModulesPaths`, package exports, and the pnpm native asset registry resolution stay configured. Metro config ESLint and `git diff --check` pass. The independent browser rerun after this root correction is pending; `/index.bundle` 404 is the latest runtime result, so app boot is still unverified.

## References

- Expo Router custom entry documentation: https://docs.expo.dev/router/installation/ (accessed 2026-10-10).
- Expo monorepo guide: https://docs.expo.dev/guides/monorepos/ (accessed 2026-10-10). Its pre-SDK-52 guidance documents the `watchFolders` and workspace `nodeModulesPaths` setup retained here.
- Installed implementation: Expo CLI 0.18.31 `@expo/metro-config/build/rewriteRequestUrl.js` computes the bundle route using `path.relative(serverRoot, entry)`; Expo 51.0.39 resolves the app's `main` field through `@expo/config/paths.resolveEntryPoint`.
