# ST-213 independent platform source review
Verdict: REQUEST_CHANGES; source only, actual PostgreSQL/HTTP proof remains pending.
Reviewed blobs: composition `6ad3b5afbaf6ee08630f54819312f26ef34e69a7`; local entry `27340fbe802f21dd6d521eafeec703c9389c8346`.
Reviewed blobs: wrapper `de3c6d9c41d94ff1b18d90238cdaa19676d07ab4`; HTTP proof `d453465fa52313f4c7f6937c941b1794cd1be1a3`.
The factory wires the real guard, resolver, session reader, repository, service, and controller with one Prisma client; the PG test uses this factory.
The wrapper creates a labelled tmpfs PG16 container and distinct ordinary login, checks the exact container/bind, and verifies cleanup before a PASS receipt.
Blocker: direct execution of `subscription-read.local.js` accepts ambient `ST213_READER_URL`; a pre-existing database with the expected role/name/RLS can pass preflight and open the listener without fixture ownership proof.
Blocker: factory init failure and `close()` await Nest shutdown without a bound; the integration test likewise awaits cleanup without a deadline, contrary to the required bounded close path.
Require a launch provenance check that the direct entry cannot bypass and bounded shutdown/cleanup; then repeat source review and actual PG HTTP proof.
