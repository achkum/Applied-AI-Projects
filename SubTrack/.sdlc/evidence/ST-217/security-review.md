# ST-217 security/privacy plan review

Decision: REQUEST CHANGES (plan only; no runtime, QA, or deployment sign-off).
Reviewed `client-binding-plan.md` blob `9f64ba24dfbdb84596f7bba9b0bd4e24606529ec` against ADR-0023 and Constitution at main `0bda40480d590f88b990eb25f945f53deec1e7b8`.
The UUID-only GET, owner-only presentation, household read-only projection, seven status pairs, target-only PATCH, bounded private errors, no credential/PII persistence or logging, and conflict/uncertain-outcome re-read match the contract direction.
Required correction: specify that a PATCH 401 or 404 clears the stale detail and disables every lifecycle control; a failed 409/uncertain-outcome re-read also leaves controls disabled and shows fixed retry copy until a successful authenticated GET restores a current owner projection. Never auto-retry PATCH.
Clarify that `visibility=owner` gates UI presentation only: the private server writer must independently bind the current principal, enforce owner scope/RLS, and validate the locked transition. The client cannot confer mutation authority.
Readiness remains NOT_READY: this review does not accept a browser credential/session path, GET/PATCH runtime, BankID continuation, or ST-216 loopback service as ordinary signed-in access.

Cycle 2 verdict: APPROVE the revised plan at blob `311ff4460413f212abc70eccd0b992ffec6983f0` for security/privacy planning scope only. Lines 4 and 12–14 now assign mutation authority to the server, clear stale private detail on PATCH 401/404, and keep controls disabled after any failed re-read until a fresh authenticated successful GET. No runtime, credential path, implementation, QA, or deployment approval is implied.
