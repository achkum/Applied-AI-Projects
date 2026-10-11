# ADR-0030: Private atomic development bootstrap nonce issue

- Status: Accepted Type 2a via ST-233k PR276; private SQL operation only, no adapter/HTTP activation.
- Date: 2026-10-11.

The awaited development bootstrap lifecycle needs one operation that inserts a nonce and completes its owned burn in the same transaction. Separate calls can leave a completed burn without a nonce or a nonce without durable completion.

`subtrack_auth.issue_bootstrap_nonce` is owned by the private executor and grants only `EXECUTE` to `subtrack_runtime`. It accepts the complete burn witness and nonce fields, requires an independently committed pending `reserve_bootstrap` burn, and matches the full owned tuple plus a fixed purpose/request digest. The digest mapping is the unkeyed UTF-8 framed purpose hash; keyed authority provenance remains a trusted producer responsibility.

The operation locks the active epoch, shared capacity, and exact reservation in that order. It samples one database clock after all waits, checks the configured origin, manifest, watermark, observed time, reservation lifetime and safe nonce lifetime, then counts every nonce row across purposes, epochs and expiry states. It inserts a nonce with null authority and conditionally completes the same owned reservation. A post-insert mismatch raises and rolls back the transaction. Callers receive only a boolean; malformed and duplicate requests do not disclose private state.

Installation refuses any drift in the seven parent files' catalog, bodies, ACL, constraints, role graph or fixture and any inbound nonce foreign key from any schema. No table or column grant, nonce update grant, new storage, key access or implicit pruning is introduced.

This operation is unregistered. The adapter, HTTP path, previous-cookie global cross-purpose live invalidation, and unknown-commit handling remain separate work under ADR-0029. PostgreSQL fixture proof and exact-head CI are required before accepting this proposal.
