# ST-216 runtime/fixture interface (2026-10-10)
1. `subscription-lifecycle.http-composition.ts` exports `createSubscriptionLifecycleApp(options)` returning `{app,listen(port),close()}` and `assertSubscriptionLifecycleStorage(options)`.
2. Options: `{prisma: PrismaClient, verifier: Pick<JwtService,'verify'>, developmentEnabled:true, host:'127.0.0.1', expectedDatabase:'subscription_lifecycle_proof', expectedRole:'st216_runtime'}`.
3. Factory receives only trusted fixture-injected objects and performs same-pool read + UPDATE/RLS/role preflight before Nest creation.
4. `subscription-lifecycle.local.ts` exports `main`, `inspectOwnedFixture(recordPath,runtimeUrl)` and `assertOwnedFixture(record,inspected,runtimeUrl)`.
5. Direct entry reads `ST216_DEVELOPMENT_ENABLED=1`, `ST216_BIND_HOST=127.0.0.1`, `ST216_BIND_PORT`, `ST216_PROVENANCE_FILE`, `ST216_RUNTIME_URL`, `ST216_TRUSTED_PUBLIC_KEY_FILE`.
6. Private provenance JSON: `{cid,label,created,runtimeUrl}`; label `ST-216:<32 lowercase hex nonce>`; `runtimeUrl` is exact full PostgreSQL URL including credential.
7. Image `mirror.gcr.io/library/postgres:16-alpine`; sole tmpfs `/var/lib/postgresql/data`; sole port `5432/tcp` bound to numeric `127.0.0.1` ephemeral.
8. URL is `postgresql://st216_runtime:<secret>@127.0.0.1:<mappedPort>/subscription_lifecycle_proof?connection_limit=1`; exact byte match to provenance precedes Prisma construction/listen.
9. Direct entry invokes existing public-key-only V1 verifier, then factory and bound loopback listener. SIGINT/SIGTERM close listener and disconnect pool.
10. Caller imports controller/service/factory directly for unit and HTTP proof; no default graph changes.
