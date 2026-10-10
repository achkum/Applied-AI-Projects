# ST-221 independent security/privacy readiness — plan APPROVE
Basis: ST-221 task, ADR-0025, accepted ST-219 contract and ST-220 private adapter, ordinary-role read/lifecycle compositions, `composition-plan.md` blob `64834802aef8dceef030c596b43de1fbd52c8229`. **APPROVE Type 2a implementation readiness** for this exact plan; composition source remains unreviewed.

Readiness criteria: explicit development enablement and production denial; private graph with only `BrowserSubscriptionReadHttpController`, accepted v2 access/current-owner/web-binding/CSRF ports, and `SubscriptionReadService(new SubscriptionReadRepository(theSamePrismaPool))`. No v1 guard, Bearer fallback, caller identity, issuer/session-store change, or default AppModule registration.

The same injected pool must pass bounded preflight before Nest creation: exact owned fixture database and ordinary LOGIN role, non-superuser/non-BYPASS, exactly one approved runtime-group membership, fixture-owned RLS and SELECT on scoped read tables, plus SELECT on `merchant` joined by `SubscriptionReadRepository.detail` (the accepted schema does not RLS that catalogue table). Future launcher owns fixture provenance before Prisma construction; this composition must not read ambient `DATABASE_URL`.

Only direct HTTPS on `127.0.0.1` with explicit positive port matching exact configured HTTPS loopback Origin is acceptable. Synthetic TLS material and auth ports stay caller-owned; errors/logs must not expose keys, token material, URLs, credentials or PII.

Nest raw body and bounded JSON parser must preserve ST-220's strict request gate. Parser failures before controller (malformed/oversize/unsupported content encoding or type) require fixed four-field `400 INVALID_SUBSCRIPTION_QUERY` plus `no-store`; unexpected failures require masked `500 INTERNAL_ERROR`. No CORS/proxy/forwarded-header waiver.

Startup and shutdown must bound preflight/create/init/listen/close, handle late successful create/init/listen by closing app-owned listeners, and state caller cleanup obligations for injected Prisma/auth ports. Negative preflight must make no Nest call. Plan lines 1–13 meet these boundaries, including the separate `merchant` check. Exact source and adversarial tests require a later independent security verdict; actual browser and owned PG evidence remains ST-222. No High or Critical finding in this plan.

## Frozen source review — C3 APPROVE
Reviewed exact runtime blob `e838495b26bef3ac68f491cf7391373e008e1ac6` and spec blob `8caf0113d12ac0fb119c7fa160c58dfa8ca6a857`; rechecked plan blob `64834802aef8dceef030c596b43de1fbd52c8229`. **APPROVE** private development-only composition source; no High/Critical finding or unresolved blocker/major.

The draft initially returned mutable `app: INestApplication`, allowing direct public bind or route addition outside its wrapper. This major finding was corrected before freeze: return shape now exposes only bounded `listen()` and idempotent `close()`.

The graph registers only the accepted v2 browser read controller/service and builds `SubscriptionReadService(new SubscriptionReadRepository(prisma))` with the same injected pool used by preflight. V2 token/current-owner/web-binding/CSRF ports remain typed and accepted; no V1 guard, Bearer bridge, issuer/session mutation, caller identity selector or default graph edit appears. The accepted adapter retains its post-await current-session/binding recheck and scoped owner context.

Before Nest creation, the pool must report exact fixture database/ordinary LOGIN role, non-superuser/non-BYPASS and one approved group membership; seven scoped tables require fixture ownership, RLS and SELECT, while `merchant` separately requires fixture ownership and SELECT. Rejections mask raw storage errors. The caller must establish fixture provenance before Prisma creation in ST-222.

The factory snapshots options and TLS bytes before the preflight await; direct HTTPS binds `127.0.0.1` only at a positive port equal to its sole exact HTTPS loopback Origin. Raw body and 64-byte non-inflating JSON parser preserve the adapter's strict body gate. Real Nest HTTPS tests show malformed, oversize, unsupported type and encoding yield fixed four-field no-store 400; parser/framework errors and hostile getters are masked.

Preflight/create/init/listen/close are bounded; late successful create/init/listen paths close app-owned resources, including an actual late-bound loopback socket test. Injected Prisma/auth/TLS remain caller-owned after `close()`. Author reported 39/39 focused tests, 92.68% statements / 96.34% branches / 82.35% functions / 98.83% lines, lint and API typecheck PASS; independent QA/full regression and exact-head CI remain gates. Actual browser, owned PostgreSQL, account and UI proof remain ST-222.
