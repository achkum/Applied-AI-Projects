# ST-206 container source review

**Disposition: REQUEST_CHANGES**

This is a source review only. The active `images-review` dispatch was present at `/workspace/.setup/images-review-dispatch.json`. No Docker builds, tests, network operations, or runtime acceptance checks were performed.

## Finding

- **High — API runtime image does not carry the generated Prisma client from the build stage.** The build stage runs `prisma generate` and compiles the API, but the runtime image copies `node_modules` and the API package from the separate `production-dependencies` stage. That stage installs with `--prod`, while `prisma` is an API devDependency, so it cannot be relied on to run Prisma generation. The runtime image therefore has no demonstrated generated client corresponding to the generated/compiled API; `PrismaClient` can fail at startup or on its first query. Carry the generated client artifact from the build stage into the production dependency tree (or generate it in a stage that has the production tree and Prisma CLI available), then verify the image.

## Reviewed implementation

- Node and pnpm versions are pinned (`node:22.18.0-bookworm-slim` for API, `node:24.11.1-bookworm-slim` for web, Corepack pnpm `12.6.0`); installs use `--frozen-lockfile`.
- Both images use Debian bookworm slim for build and runtime, preserving Prisma's libc/OpenSSL family. The API generation uses a build-only placeholder `DATABASE_URL` and makes no database connection by design.
- API compilation emits `apps/api/dist`, with `CMD ["node", "apps/api/dist/main.js"]`. Its runtime copies `packages/contracts` and the workspace package links needed by `@subtrack/contracts/identifiers`; the referenced source file is included.
- The web config enables standalone output and sets the tracing root from the web package working directory to the monorepo root. The runtime copies standalone output and `.next/static`; `apps/web/public` exists in the reviewed tree and is copied.
- Both runtime images select non-root users and set production mode. No startup install, automatic migration, host port binding, or default auth activation was found in the reviewed Dockerfiles.
- `.dockerignore` excludes environment files except `.env.example`, node_modules, VCS data, common caches/build/test outputs, evidence, and key-like files. The repository `.npmrc` contains only `manage-package-manager-versions=false`.

## Reviewed file hashes

```text
apps/api/Dockerfile       0e65b923292908af1fff268dc52dfe1ff6182d6e85e59be0729c5f086fa5a3a7
apps/web/Dockerfile       ed2ee34841d35931b21ced29eb49460bffa06b50d0060d5e524ee953b768503b
apps/web/next.config.ts   8f6c52be3c5fe8ad144eec1c5dc9dc1417598dc2f56300b37e7d88c11c889c97
.dockerignore             da208cf9db9622d03269d556511d814153d429ac412315577f6325d955d574e6
```

This review does not establish container build success, `/healthz` behavior, `/sv` behavior, or production readiness.
