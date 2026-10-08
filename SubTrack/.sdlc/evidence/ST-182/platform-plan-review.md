# ST-182 platform preimplementation review

**Disposition: APPROVE**, with the required implementation constraints below. This approves only the unwired development/test reference described in `.sdlc/tasks/ST-182.md`; it does not approve an HTTP exchange, production refresh policy, durable atomicity, provider behavior, or client readiness.

## Interfaces and boundary

- `ProofStore.consumeLogin(secret, context)` takes the proof plus `LoginProofContext` (`transport`, and for web `exactOrigin` and `browserChainId`). It validates the `v2.` proof syntax, atomically consumes through `compareAndConsumeLogin`, and returns `{ valid: true, identityId }` or a frozen `{ valid: false }`. The successful `identityId` is already restricted to canonical lowercase UUID syntax. Its internal call is async, so treat the result as the sole identity source; do not accept identity or challenge selectors from issuer input.
- `V2AccessToken.issue(identityId, sessionId)` is synchronous and returns a string; `verify(token)` supplies the corresponding claims. IDs must be canonical lowercase UUIDs. The issuer should bound/check the returned token string as specified and collapse failures to a generic session error.
- OpenAPI `SessionRequest` is a `oneOf` web/mobile union. Web has exactly `transport` and `loginProof`; mobile has those plus optional `deviceName` (schema maxLength 100). The internal issuer can take only `loginProof`, independently verified `transportContext`, and optional `deviceName`; transport context is trusted server input and must not be conflated with the body.
- The repository shape `createForActiveIdentity(record, context): boolean | Promise<boolean>` is sufficient for atomic check-and-insert if the memory implementation performs the active identity check and all collision/capacity checks plus insertion synchronously, without an `await`. `markIdentityDeleted` must synchronously remove active registration and owned sessions. This closes the consume-to-create deletion race: deletion first rejects create; create first linearizes before deletion, after which deletion removes that session. Durable implementations would need a separately reviewed transaction/conditional operation.
- Rollback must compare identity, session, family, and refresh hash to the exact inserted row before deleting. This handles both a normal create followed by token failure and an ambiguous create that inserted then threw; a collision or unrelated row is preserved. Return a generic failure even if rollback itself fails, and never return credentials on that path. Consumed proof remains burned.

## Retention, limits, and tests

The 24-hour `createdAt`/`expiresAt` lifetime is a bounded development-reference storage lifetime only. It is not a production refresh-token lifetime or policy. Validate safe nonnegative millisecond clock values and overflow-safe `now + 24h`; reject future-created, expired, or wrong-duration records. Prune expired records before capacity checks. Enforce both 10,000 active-identity/session bounds, plus the optional 1–10,000 test session cap. Keep only the domain-separated SHA-256 refresh-token hash, never the raw refresh token or proof.

The requested tests are feasible with the existing `DevelopmentSimulatorLoginProofProducer`, `ProofStore`, and `V2AccessToken` test seams. Exercise both web and mobile end-to-end against the simulator fixture and verify token claims, identity/session association, transport binding, hash-only storage, TTL and single-consumer replay behavior. Deterministic UUID/random/time seams or injected factories will make collision, capacity, rollback, and deletion interleavings testable without weakening the server-owned dependency boundary. For concurrency, `consumeLogin` is backed by an atomic compare-and-consume; the in-memory create linearization is synchronous. Promise-based callers can therefore assert one proof winner and reject session creation after deletion.

Keep reads owner-scoped and require a currently active registered identity in `readSession`; expired or deleted-owner sessions return null. This does not establish that an issued session remains owned after commit, so later authorization must use a separately reviewed current v2 principal resolver. Do not add listing, refresh rotation, revocation, HTTP wiring, database persistence, or a multi-process atomicity claim in this task.

## Required implementation details

1. Snapshot input and context before collaborator calls; reject accessors, symbols, hidden/extra keys, and nonplain objects without invoking getters. Validate strict v2 proof format and safe clock before consuming.
2. Use proof-derived UUID only; generate distinct session and family UUIDs, generation zero, and a 32-byte random refresh credential with `v2r.` plus canonical base64url encoding. Persist only its domain-separated hash.
3. Preserve exact transport metadata: web origin and browser chain only for web; mobile device name only, with the 100-Unicode-codepoint bound. Do not add caller-selected identity, challenge, session, family, or action fields.
4. Validate and freeze records at repository boundaries, including scope, canonical IDs, collisions, exact 24-hour expiry, transport metadata, capacity and active-identity registration. Copy the constructor's bounded active identity list; never create or re-enable identities there.
5. Roll back exact created state on false, thrown/ambiguous create, or access-token issuance/validation failure. Do not expose errors, proof, token, or token material in logs or failures.

No blocking platform design issue was found in the reviewed interfaces. Security review remains a separate merge gate, and ST-170b/c incompleteness continues to block any client-ready or runtime claim as stated in ADR-0010 and the task contract.
