# Private ordinary lifecycle writer — security readiness
Disposition: CONDITIONALLY READY for a separate, private UF-08 repository slice only; no ST-081, route, or release approval.
ADR-0016 §3 permits ACTIVE pause/cancel/archive, PAUSED resume/cancel/archive, and CANCELLED archive; reject every other pair.
Derive `RequestContext.userId` only from the accepted trusted current principal; set both identical transaction-local GUCs through `withRequestTransaction`.
Under ordinary non-BYPASSRLS RLS, lock the identified row, require `identity_id = principal`, decide from locked status, conditionally update, and return bounded status data.
Prove nonowner/peer/share/open-book/always-private denial, same-row races, stale conflicts, rollback, and pooled-context cleanup on disposable reconciled PG16.
UF-08 and API_CONTRACT list these actions but impose no explicit ordinary-action audit event or replay receipt on a private repository operation; DATA_MODEL's generic audit_log does not itself define one.
ADR-0016 §§1,5,6,26 and ST-081 AC5/AC7/AC8 reserve review/undo/feedback evidence and receipt retention/erasure decisions; do not implement or waive those in this slice.
No new persisted PII, audit payload, replay key/receipt, schema, API contract, HTTP/default module, provider, or persistent database is authorized here.
Before an HTTP mutation or any audit/replay persistence, define the required contract and minimum fields, owner RLS, retention/erasure, and independent security review; mutating POSTs need the API_CONTRACT idempotency decision.
This is a reversible Type 2a scoped implementation under accepted policy; no founder security-model or product-scope decision is needed unless those boundaries change.
