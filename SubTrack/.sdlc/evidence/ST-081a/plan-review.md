# ST081a plan review

**Decision: APPROVE the bounded plan for a separate, explicitly scoped implementation task. This is plan review only; it does not authorize implementation or change ST-081 readiness.**

ADR-0016 §3 permits the private decision core described here. It fixes the ordinary single-record transition semantics and says unlisted changes conflict. Its “not runtime authority” and retained implementation gates constrain callers and persisted/integrated behavior; they do not forbid a pure function from calculating the accepted status result. DECISION_RULES §1 classifies a private helper inside one module as Type 2b. ST-081 remains BLOCKED on its stated prerequisites, and its current `allowed_paths` do not include the proposed domain package paths. Create the separate child task with concrete allowed paths and record assumptions before dispatch, as the plan says.

The proposed matrix matches ADR-0016 §3 exactly (14 permitted pairs):

| Current | Action | Next |
| --- | --- | --- |
| DETECTED | confirm | ACTIVE |
| DETECTED | reject | REJECTED |
| DETECTED | archive | ARCHIVED |
| TRIAL | activate | ACTIVE |
| TRIAL | cancel | CANCELLED |
| TRIAL | archive | ARCHIVED |
| ACTIVE | pause | PAUSED |
| ACTIVE | cancel | CANCELLED |
| ACTIVE | archive | ARCHIVED |
| PAUSED | resume | ACTIVE |
| PAUSED | cancel | CANCELLED |
| PAUSED | archive | ARCHIVED |
| CANCELLED | archive | ARCHIVED |
| REJECTED | archive | ARCHIVED |

The other 35 pairs across the seven statuses and seven listed actions conflict, including every ordinary outgoing action from ARCHIVED. The fixed `new Error('LIFECYCLE_CONFLICT')` contract is a suitable private Type 2b representation of that conflict: it does not reveal caller values, and the plan explicitly excludes a cause. Runtime checks can reject non-primitive/non-string values before any property access or coercion; use own-key-safe lookup (or direct comparisons) so inherited-looking strings cannot act as entries. The planned tests should prove no getter access, coercion, or raw-value leakage for the malformed values listed in the plan, and exact error message/type behavior.

The helper's stated boundary is appropriate: it computes only the next status for supplied values. It proves neither that the supplied status is current nor that the caller owns or may mutate a record. Authentication, authoritative reads, atomic version checks, idempotency, audit, persistence, and RLS remain caller/integration obligations under ADR-0016 and ST-081. Merge, edit, undo, and missed-charge automation are correctly outside this helper. Do not claim full ST-081 or UF-06 completion from this extraction.

No plan changes requested. No implementation approval. The separately scoped child task should preserve these boundaries and may proceed only after its allowed paths and task contract are recorded.

## Review scope and call accounting

Read the exact requested paths: `SubTrack/AGENTS.md`, `SubTrack/docs/governance/CONSTITUTION.md`, `SubTrack/docs/governance/DECISION_RULES.md`, `SubTrack/docs/architecture/adr/ADR-0016.md`, `SubTrack/.sdlc/tasks/ST-081.md`, `/workspace/.setup/ST081a-plan.md`, and `/workspace/.setup/ST081-lifecycle-readiness-next.md`.

Three shell calls total: one batched read of the exact listed paths, one complete read of ST-081 after the batched output was truncated, and this report write. No command failed; the first command's displayed output was truncated and was supplemented by the second read. No tests, git, network, installs, database actions, or repository implementation edits were performed.
