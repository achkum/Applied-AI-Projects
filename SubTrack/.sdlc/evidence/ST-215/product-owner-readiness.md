# ST-215 product readiness — 2026-10-10

Decision: APPROVE Type 2a status-only PATCH contract reconciliation.
UF-08 names Pause tracking, Mark cancelled, and Archive; it does not promise status edits via a broad PATCH payload.
ST-205 ADR-0016 §3 accepts ACTIVE→PAUSED/CANCELLED/ARCHIVED, PAUSED→ACTIVE/CANCELLED/ARCHIVED, and CANCELLED→ARCHIVED; resume is explicitly supported.
The ST-081a pure helper uses the same ordinary action/status semantics, including PAUSED resume→ACTIVE; it grants no route authority.
The seven current-owner transitions are a coherent, bounded implementation of the accepted UF-08 actions; the security readiness review separately approves no new audit/replay/retention state for this slice.
Keep API_CONTRACT's name/category/cadence/alwaysPrivate/catalogPlanId editing as an explicitly future/manual-edit roadmap capability; status-only here must reject those fields.
Clarify that broader PATCH semantics are not yet contracted or implemented, and that this reconciliation does not complete ST-081, UF-06, or broader subscription editing.
This is product readiness for contract authoring only; route/runtime readiness remains gated by ST-081c and independent security/DB proof.
