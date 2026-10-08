# ST-184 security source review

**Decision: APPROVE** the reviewed source and lifecycle tests against the ST-184 contract. This is a security source review of the internal synchronous in-memory lifecycle only.

The repository accepts only the two credential hashes, exact transport context, and observed time. Its own-property snapshots reject identity/session/family selectors, accessors, hidden fields, symbols, and extra keys. On a matching active hash, identity is derived from the stored row; a frozen owner context is constructed internally. Reads and cleanup remain explicitly owner-scoped. `rotateRefresh` has no `await`, validates its own clock and observed-time bounds before trusted-time pruning, and commits tombstone plus same-session replacement synchronously.

Rotation preserves the existing row fields while changing only the hash, retaining generation 0, identity/session/family, transport metadata, creation time, and original 24-hour expiry. The successor is checked against active and unexpired consumed hashes, and tombstone capacity is checked before consuming the current credential. A matching consumed hash with the same transport binding revokes only the original owner's family; wrong binding leaves the successor usable. Tombstones survive rollback and family cleanup through original expiry, are pruned by repository time, and are cleared on owner deletion. The cleanup operation requires the current successor tuple and owner context.

The lifecycle tests cover same-ID rotation, generation/creation/expiry preservation, web and mobile replay through the shared resolver, invalid older/current access after family reuse, unrelated same-owner family and neighboring-owner preservation, concurrent same-hash rotate/reuse, wrong transport/origin/chain, collisions and capacity without token burn, strict input descriptors, trusted-time boundaries, tombstone retention/pruning, deletion cleanup, and stale/current cleanup tuples. No blocking security defect found.

Limits: no QA, test, lint, typecheck, build, Git, or runtime command was run by this reviewer. This approves only the source seam reviewed below; it makes no claim about HTTP integration, refresh-token transport, CSRF, durable/cross-process atomicity, runtime wiring, deployment, or production readiness.

Reviewed files and SHA-256 (absolute paths):

`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuer.ts`: `b078da7ea9713b6f696ab12ead15c3fae7220fbfcbdaa8f45a06b9dc4ee1d142`

`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuer.spec.ts`: `7d0189e0e305b185eaedc1d160bdef24af657e61c2cd76a4cb376be7a02fdba3`

`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-lifecycle.spec.ts`: `543ac85ecfa7b115311de39738314eaa95fb05a2cc1fb00b5b40d549a4272189`

**Actual tool calls:** 5 total: (1) locate task/source files and inspect worktree status; (2) read task, repository instructions, source/specs and related references; (3) read Constitution, lifecycle details and resolver; (4) read the approved security plan, calculate hashes and write the initial artifact; (5) recalculate exact hashes and correct the hash section, then write the requested review artifact. No source, QA, or Git changes were made; only review evidence was written.
