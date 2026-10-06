# ST-175 platform review — final

Verdict: **APPROVE** for the scoped v2 HTTP transport/configuration prerequisite.

Reviewed current source against `.sdlc/tasks/ST-175.md`, `docs/product/API_CONTRACT.md`, and ADR-0010 at base `4cc3ffbba86c6aa4c4871b9d4fbc94a0f098105b`. The implementation has strict opt-in configuration and field-name-only failures; preserves raw duplicate Origin/cookie evidence; derives TLS from the direct `TLSSocket` and requires loopback origin plus actual loopback peer for explicit development HTTP; and applies `no-store`/`no-cache` to `/v2` while preserving v1/lookalike behavior and logger/filter wiring. Cookie parsing rejects duplicate recognized cookies, name-separator whitespace, malformed syntax, and trailing value whitespace. The prior review concern about `=` in a cookie value is withdrawn: RFC 6265 cookie-octet permits `%x3D`.

The test-only Nest probe and ephemeral OpenSSL HTTPS fixture exercise the actual HTTP/TLS pipeline; fixture material is cleaned up. Final validation: focused tests 31/31, API suite 316/316, scoped lint exit 0, and API typecheck exit 0. The current-source hashes below match `/workspace/.setup/ST175-final-source-hashes.txt`.

Approval covers only the assigned transport/configuration prerequisite. It does not establish auth routes, principal/session authority, nonce/idempotency/throttle design, provider integration, persistence, production configuration, or rollout readiness; those remain separate gates.

## Mechanically computed current source hashes (SHA-256)

```
ab445d5ea138812eedae66ca89b893e84e48982ef548bc2fb0fff4b58d60feb0  apps/api/src/config.ts
9e8a0eaa2f7ffb120e0753d6c387fc2cd2f877d554cafc8debdfc593a71cce7d  apps/api/src/config.spec.ts
3c8ee4675815d2f44a353826a1d49c9f2c21990cbc7c96c5f52af7490d42b9a8  apps/api/src/main.ts
39ba77f29cda731da458c23a8e424bda20f257493226bc68a2b09e7de3cbc813  apps/api/src/auth/http/v2-browser-context.ts
145e1782e26c5fc182684e94cda39bf3638923ca0dd9b2c5dbc16e280332149d  apps/api/src/auth/http/v2-browser-context.spec.ts
ac1653b39ffe24f8552a21d6352a280727840baed7f414f867d7de06b55dc907  apps/api/test/v2-browser-context.spec.ts
```
