# ST186 platform plan review

**Decision: APPROVE**

The plan is coherent as an internal, development/test-only reference for owner- and current-session-scoped listing. It matches the accepted v2 contract’s owner-scoped listing and current-credential principles, and the OpenAPI `SessionSummary` shape (`id`, ISO date-time `createdAt`, `current`, optional nullable `deviceName`). It keeps HTTP wiring, contract changes, provider work, deployment, and production-readiness claims out of scope.

The security boundary is well stated: derive the owner from the validated request context, recheck that the requesting session is still active and owned by that principal at listing time, then scan only that owner’s records against trusted time. Requiring a live current session prevents a previously resolved credential from authorizing a listing after revocation or family reuse. Frozen copied summaries, deterministic ordering, strict clock/date validation, and exclusion of owner/family/hash/token/transport selectors and secret metadata are appropriate for this bounded in-memory reference. The proposed tests cover the material isolation, freshness, immutability, and adversarial-input cases.

**Conditions and limits:** This approval covers the plan only. Do not begin ST186 source work until ST183 and ST184 are accepted and ST185 is complete, as the queued task specifies; recheck shared-file conflicts then. The current workflow status reported for this review has ST184 CI pending and ST185 queued, so those gates are not yet satisfied. Keep the result explicitly internal/development-only; it does not establish HTTP/client readiness, production storage semantics, or production rollout safety.

**Review basis:** `AGENTS.md`, `docs/governance/CONSTITUTION.md`, `docs/architecture/adr/ADR-0010.md`, `/workspace/.setup/ST186-task-draft.md`, current v2 issuer and principal resolver, and the cited OpenAPI listing and summary sections.

**Tool calls:** 2 total (1 batched read; 1 artifact write).

## Amendment: ST185 is not a source-work gate

**Decision remains: APPROVE.** Remove the requirement to wait for ST185 completion before beginning ST186 source work. The checked task scopes show ST185 owns only the new refresher source/spec, while ST186 owns the existing issuer file and a new listing spec; they have no source-file overlap. The draft’s stated reason for serialization (“to avoid shared-file conflicts”) is therefore incorrect. ST186 may proceed on its independent branch while ST185 CI is pending, subject to the conductor’s single-heavy-job scheduling constraint.

Retain ST183 and ST184 acceptance as prerequisites; they are reported merged to `main` at `911755d`. This amendment changes only the unnecessary ST185 workflow gate. All contract alignment, owner/current-session checks, internal-only scope, and other limits in the original review remain in force.

**Updated tool-call accounting:** 3 cumulative calls (1 batched read; 2 artifact writes).
