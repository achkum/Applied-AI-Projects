# ST186 Security Plan Review

**Decision: OWNAPPROVE**

This review approves the proposed internal, development/test-only owner-scoped listing design, subject to the accepted ST183/ST184 contract prerequisites. ST183 and ST184 are already merged. ST186 may proceed independently of ST185's CI: ST185 changes only `refresher.ts` and its spec, while ST186 plans to change the existing issuer file and add a listing spec, so there is no source-file overlap. This approves a plan only; it does not approve runtime wiring, an HTTP/controller change, a public contract change, production readiness, or completion of ST186.

The synchronous method on the existing in-memory repository is an appropriate boundary for the current-session recheck and owner scan. The resolver’s prior authorization alone is insufficient: between resolution and listing, the requesting session could be revoked, expire, or lose its active owner. The listing method must therefore revalidate that exact request session from stored state against the supplied owner context and trusted clock immediately before building output. In this in-memory implementation, keeping that recheck and scan synchronous avoids an intervening mutation.

The method must accept only a canonical request session ID, an exact own-data-property context containing the matching active owner ID, and a safe nonnegative observation time no later than the repository’s trusted clock. Reject malformed clocks and dates before pruning. Pruning may use only the trusted clock; reject future or backdated observations that do not satisfy the documented bounds. Require the request session to be present, owned by that context, created no later than the observation time, unexpired at trusted time, and still associated with an active identity. Return `null` on invalid, missing, expired, revoked, or deleted request sessions.

Scan and return only live records belonging to the validated owner. Do not expose selectors for another owner, transport, family, generation, or refresh hash. Do not inspect or return foreign rows, and do not reveal their existence through results or errors. Use the repository’s fixed maximum of 10,000 records and avoid pagination or unbounded auxiliary state.

Each result must be a newly copied, frozen object with exactly the accepted `SessionSummary` fields: `id`, `createdAt`, `current`, and `deviceName`. Convert only valid in-range timestamps to ISO-8601 UTC; fail closed on unrepresentable timestamps. Freeze the returned array and its elements. Sort by descending `createdAt`, then lexical session ID, so ties are deterministic. Do not include identity, family, generation, transport, token, hash, browser-chain, or invented activity metadata.

The tests described in the draft should exercise issuer and resolver integration, exact minimal output, owner isolation, immutability and copy independence, deterministic ties, rotation behavior, family reuse, deletion, expiry, invalid contexts/clocks, accessor rejection without getter execution, and the post-resolver revocation race. They should also prove that a future caller-supplied time cannot prune another live session. These are substantive security cases for this change.

The accepted ADR describes the v2 contract as contract-only and leaves runtime, provider, database, and rollout work gated. The OpenAPI session summary provides the exact wire-shaped summary fields, but that does not make this internal repository method an HTTP feature. Preserve those boundaries and keep the implementation development/test-only.

**Accounting:** Initial review used two tool calls (the specified-file read and artifact write); this bounded amendment is the third cumulative tool call.
