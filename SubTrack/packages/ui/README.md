# Shared UI test tooling

Run `pnpm --filter @subtrack/ui typecheck` and `pnpm --filter @subtrack/ui test` from the SubTrack workspace.

UI pins Vitest 5.0.3 while web uses 5.0.2. With pnpm 12.6.0, an unrelated Vitest 4/coverage-v8 peer cycle flattens jest-dom's Vitest peer identity to its base version. The distinct patch versions preserve each consumer's matcher augmentation and existing Vite context. BUG-019 records the controlled reproduction and reviewed scope.

When updating these pins or the package manager, verify that jest-dom's resolved Vitest realpath matches its consumer's own Vitest, then run strict typecheck, unchanged tests and required full CI. Revisit version convergence when a supported resolver preserves these contexts. Keep the normal frozen-install and supply-chain policies.
