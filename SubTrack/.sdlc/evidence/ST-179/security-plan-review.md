# ST-179 security/privacy preimplementation review

Decision: approve the bounded internal redemption design, conditional on the concrete control below. This is design approval only; no source was reviewed or implemented, and no QA was run.

Reviewed: `.setup/ST179-task-draft.md`, `SubTrack/AGENTS.md`, Constitution, ADR-0010, accepted `/v2/auth/session` OpenAPI request, current `ProofStore`, simulator producer, and ST-178 security plan review.

The proposed method accepts only a one-use secret and a snapshotted validated transport context, checks the stored login purpose/action and complete web binding, then returns only the stored identity after atomic deletion. The accepted session request carries only transport and login proof; deriving identity from stored proof is consistent with that contract. The in-memory check/delete can be atomic while synchronous; the optional adapter method must fail closed when absent, and future durable adapters require a transaction/conditional delete. Preserve generic `consume` behavior and keep session/HTTP/runtime wiring out of this slice.

Required implementation controls:
- Require an explicit canonical lowercase UUID validation rule for the identity both when validating the stored record and before returning it. The draft says “valid canonical registeredUUIDidentity” but does not define the grammar; the generic store currently permits any nonempty identity. Match the simulator producer’s accepted UUID form or cite the repository’s authoritative identity contract.
- Snapshot context once through own data descriptors; require a plain data object, exact allowed keys, no symbols/accessors/non-enumerable properties, and freeze a new null-prototype snapshot. Web requires exact HTTPS origin and nonempty chain; mobile permits only `transport`. Reject before repository access.
- Validate secret syntax, safe-integer clock and stored times, expiry bounds/TTL, purpose `login`, action `authenticate`, and transport/origin/chain before deletion. Any binding/corruption mismatch must leave an otherwise-live proof available; errors and results remain generic, with no raw secret or identity in logs.
- Validate the optional adapter’s returned identity before exposing it; missing method, thrown/rejected adapter, malformed identity, or invalid clock returns only frozen `{ valid: false }`. Return frozen `{ valid: true, identityId }` only after adapter confirms atomic deletion.
- Preserve no-await in the in-memory lookup/check/delete, bounded capacity/pruning, hash-only storage, and meaningful tests for actual ST-178 web/mobile producer proofs, mismatch no-burn, corrupt purpose/action/identity/time, replay/concurrency, malformed context/secret, missing/erroring adapter, and generic failures.

Reviewed files by focused shell reads/searches only. Actual total tool calls, including this artifact write: 5. No Git operations, source edits, installs, or tests/QA were run.
