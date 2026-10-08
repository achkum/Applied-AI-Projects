# ST184 platform source review

Decision: **APPROVE**.

The implementation satisfies the approved in-memory credential-authentication boundary. `rotateRefresh` accepts only the credential hashes, transport binding, and observed time; it locates active credentials by hash and derives the frozen owner context from the matched stored row or tombstone. The synchronous method validates before mutation, checks the trusted clock, owner activity, full transport binding and lifetime, successor collisions, and tombstone capacity before consuming the active credential. Rotation replaces only the hash while retaining session/family identity, generation 0, metadata, creation time, and fixed expiry. Reuse checks the stored transport binding and revokes only the original owner's family. Tombstones survive rollback and family cleanup through original expiry, and deletion removes that owner's rows and tombstones while leaving the identity inactive. Tuple cleanup requires the current successor hash.

The lifecycle specs exercise web/mobile rotation and reuse through the shared real resolver, old and current access-token denial after reuse, preservation of same-owner neighboring families and another owner's session, concurrent rotation/reuse, malformed and exotic input rejection, no-burn collision/capacity failures, trusted-time boundaries, tombstone retention/pruning, deletion, and stale cleanup tuples. The issuer spec was read in the initial source pass and covers stored hash-only state and session-ID collision preservation. The shared repository and current-state resolver behavior match the task contract.

## Source hashes

- `/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuer.ts`: `b078da7ea9713b6f696ab12ead15c3fae7220fbfcbdaa8f45a06b9dc4ee1d142`
- `/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuer.spec.ts`: `7d0189e0e305b185eaedc1d160bdef24af657e61c2cd76a4cb376be7a02fdba3`
- `/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-lifecycle.spec.ts`: `543ac85ecfa7b115311de39738314eaa95fb05a2cc1fb00b5b40d549a4272189`


## Limits and accounting

This decision covers the synchronous in-memory source seam only. It does not approve a refresh service, HTTP/runtime wiring, durable adapter guarantees, deployment, or production/client-ready authentication. No tests or QA were run in this review. The initial four calls were mispacked and did not yield a complete review; two corrective calls brought actual total calls to **6**. The corrective read returned a truncation warning, but the complete task, plan decisions, relevant rotation implementation and lifecycle edge cases were available across that read and the earlier source pass. No source files were changed.
