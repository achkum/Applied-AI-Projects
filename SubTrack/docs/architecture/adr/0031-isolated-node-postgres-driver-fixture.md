# ADR 0031: Isolated Node PostgreSQL driver fixture
- Status: Proposed Type 2a for ST-233l; proof-only, pending actual Linux PG16 qualification.
- The owned PG16 fixture keeps `--network none`, no published ports, and its existing mount custody.
- A separate pinned Node image joins only that container network namespace and runs as the host runner UID.
- Its root is read-only, capabilities are dropped, and only a curated bundled driver and private config are mounted read-only.
- `pg@8.23.1` and `@types/pg@8.23.1` are exact pinned permissive development proof inputs.
- The fixture executes fixed SQL on fresh restricted-login clients and distinguishes exact `COMMIT` from aborted `COMMIT` returning `ROLLBACK`.
- A lost reply or failed close remains unknown; no result can authorize product state or disclose a secret.
- The proof owns bounded sidecar/client cleanup and checks identity, network, mounts, labels, and source pins.
- Production J port, SQL 004/008/006 adapter behavior, HTTP, storage, and public access require separate review and actual PG proof.
