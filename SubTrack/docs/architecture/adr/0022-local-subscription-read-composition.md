# ADR-0022: Loopback development composition for subscription reads

**Status:** Proposed for ST-213 independent security readiness and implementation review (2026-10-10)  
**Decision class:** Type 2a, reversible local runtime composition

## Context

ST-212 proved the three authenticated subscription GET contracts through a test Nest application and an owned disposable PostgreSQL 16 fixture. Its controller is absent from default `AppModule`, and the web client has no accepted Bearer credential transport. A local service is useful for integration work, but enabling these routes against an inherited database or an implicit identity would exceed that proof.

## Decision

Provide one reusable Nest composition factory under `apps/api/src/subscriptions` for `SubscriptionReadController`, `AuthenticatedPrincipalGuard`, `PrincipalResolver`, `PrismaSessionOwnerReader`, `SubscriptionReadRepository`, and `SubscriptionReadService`. Supply one ordinary-role `PrismaClient` and an explicit `JwtService.verify` capability to that factory. The factory owns Nest initialization and a bounded close path; its opt-in development listener binds only numeric `127.0.0.1`. The existing PG HTTP test uses this same factory instead of a testing-module guard override. It may keep its in-memory ephemeral `JwtService` and issue only synthetic fixture tokens inside the test.

The development launch wrapper must create a **new**, labelled, tmpfs-backed PG16 container on a random loopback port, apply the canonical migrations, provision a separate login role inheriting only `subtrack_runtime`, and verify container identity, port binding, database name, role attributes, table ownership, privileges, and RLS before launching. It must take its connection details from that verified fixture creation, not `DATABASE_URL` or a user-supplied disposable marker. The direct Node entry requires the wrapper's private creation record and independently inspects its full container ID, unique label, creation time, running PG16 image, tmpfs data mount, and sole numeric `127.0.0.1` binding. The reader URL's host, port, database, and role must match that inspected container and the fixture contract before Prisma construction. Startup independently rejects a missing explicit development switch, non-loopback binding, unexpected database/role, owner/superuser/BYPASSRLS connection, or failed RLS checks. Keep credentials in private temporary files or process memory; sanitize failure receipts and verify container/temporary-file removal before PASS. The wrapper never points at a persistent or pre-existing database.

The application exposes only `GET /v1/subscriptions`, `GET /v1/subscriptions/:id`, and `GET /v1/review-inbox`. The accepted raw Bearer parsing, JWT verification, current session/identity lookup, request-scoped RLS transaction, visibility projection, problem responses, and read wire contract remain authoritative. Local entry uses a public-key-only capability extracted from the existing `JwtService.verify` implementation; it cannot issue tokens or generate a key. Existing `JwtService` construction and signing behavior remain unchanged for other consumers. There is no issuer endpoint, identity-header switch, provider, cookie bridge, account/household creation, lifecycle write, or raw-token response. Default `AppModule`, contract, and web runtime stay outside this composition. The development process creates no production key or default credential; a caller must explicitly provide the verifier. The test's ephemeral signing key is confined to its synthetic fixture. Nest initialization, close, Prisma disconnect, and wrapper child shutdown need deadlines so failed startup cannot strand fixture cleanup.

## Consequences and gates

For an opt-in local run, provide an existing trusted Ed25519 public key PEM and choose a local listener port:

```bash
ST213_DEVELOPMENT_ENABLED=1 ST213_BIND_HOST=127.0.0.1 \
  bash tools/database/subscription-read-proof.sh --serve /path/to/trusted-public.pem 4300
```

The wrapper creates and removes its own disposable database. The public key must correspond to a separately managed trusted issuer; this task provides no user login path.

This makes a loopback developer service available without claiming user login or web feature availability. Reuse of the factory in the actual PG test must prove startup rejection and the existing HTTP role/RLS/privacy/cursor/bigint/revocation/pooled-context assertions. Independent security readiness precedes runtime changes. Parent PR237/PR240 acceptance, independent actual-PG QA, changed-source coverage, required reviews, and green exact-head checks remain merge gates. No production/public deployment or existing-database operation follows from this ADR.

The launch and provenance claim is limited to Linux with Docker. The dedicated Linux PostgreSQL workflow must run the real `--serve` wrapper with a generated public key, observe all three unauthenticated GETs return 401 on its loopback listener, exercise direct Node rejection for absent, forged, stale, and URL-mismatched provenance, then terminate the listener and verify the exact owned container, private fixture directory, and listener are gone before recording a sanitized STOPPED receipt. A source-only or mocked unit run cannot establish this launch claim.
