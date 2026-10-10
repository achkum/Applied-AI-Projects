# ST-213 security/privacy readiness
Verdict: APPROVE_READINESS for the proposed local-only composition; runtime, PostgreSQL proof, and source remain unreviewed.
The three accepted GET contracts may reuse the existing guard, JWT verification, current-session reader, scoped transaction, repository, and service with one ordinary Prisma client.
Startup must require an explicit development switch and numeric `127.0.0.1`; reject any other host, missing verifier, wrong role/database, failed privilege/RLS validation, or unavailable fixture before `listen`.
The launch wrapper must obtain the full container ID from its own successful `docker create`, then inspect that exact ID for its unique task label, tmpfs PG16 mount, and loopback-only random binding; a caller-supplied URL or `ST212_DISPOSABLE` marker is insufficient ownership proof.
Use only the newly created fixture's connection details, ignore inherited `DATABASE_URL`, apply canonical migrations, and verify the runtime role is a distinct login that is nonowner, nonsuperuser, non-BYPASSRLS, has only expected membership/grants, and sees RLS-enabled tables.
The actual development launch path must construct a reviewed `JwtService.verify` capability from explicit trusted key material; structural verifier injection into the reusable factory must not become an environment-configurable or user-supplied permissive stub.
The existing test may use its ephemeral in-memory `JwtService` to issue synthetic tokens, but this grants no product login, issuer endpoint, default credential, or production key generation.
Keep fixture secrets, tokens, identifiers, and URLs out of logs, command output, receipts, and committed examples; sanitize failure output and declare PASS only after verified container and private-temp cleanup.
The same factory must run the actual HTTP proof, preserving owner/peer/DETECTED/private/inbox, filters/cursors/bigint, revoked-session, and pooled-GUC assertions, plus meaningful fail-closed startup cases.
No Type 1 change is required by this design. Any issuer/provider/cookie bridge, default graph/web exposure, persistent DB use, or security-model change needs a separate decision before implementation.
Parent PR237/PR240 remain unaccepted despite source/CI proof; independent source/actual-PG QA, coverage, exact-head gates, and parent acceptance remain merge conditions.
