# ST-217 platform architecture review
Decision: APPROVE revised plan only; implementation remains NOT_READY.
Reviewed `client-binding-plan.md` blob `311ff4460413f212abc70eccd0b992ffec6983f0` against OpenAPI, ADR-0023, read service/controller, and source parent `main` `0bda40480d590f88b990eb25f945f53deec1e7b8`.
The UUID-only detail GET, `VisibleSubscription` owner/household projection, seven offered owner transitions, target-only PATCH, bounded `{id,status}` result, and exact lifecycle problem codes align with the accepted contract.
`visibility=owner` is a presentation gate only. Trusted current-session Bearer principal, owner scope/RLS, and locked-status transition checks remain server authority; client selectors confer none.
PATCH 401/404 clears stale private detail; 409 and uncertain outcomes trigger an authoritative GET. Failed re-read keeps detail unavailable and controls disabled; no automatic PATCH retry. This matches ADR-0023's lost-response semantics.
Canonical amount strings require `BigInt` and `packages/money` formatting. The current `ReceiptCard` interface uses numeric minor units, so its future interface change and removal of mock price history/savings are correctly in later client scope.
Both GET and PATCH are contract-only/unavailable by default; the read controller is test-only and absent from `AppModule`. Generated bindings do not establish runtime availability.
Later implementation requires a reviewed authenticated browser principal/session path and accepted usable GET/PATCH runtime, including BankID/household continuation. ST-216 loopback testing does not provide ordinary signed-in browser authority.
Approval is for this source-pinned platform plan only; no runtime, auth, UI implementation, QA, release, model, rollout, or task-DONE approval is implied.
