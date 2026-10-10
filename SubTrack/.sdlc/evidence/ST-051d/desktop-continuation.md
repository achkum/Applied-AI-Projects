# ST-051d desktop route regression validation — 2026-10-10

Preserved handoff base: f8a7340ebfb98b14697b9c1d63470356d9eaaa8c.

CI run 38044225271 failed four stale RootIndex expectations after the accepted handoff changed the root route to /welcome. Updated tests preserve that intended routing for stored sv/en, missing and unsupported locale. Actual WelcomeRoute tests prove create/register, enum-only unavailable-login, and locale-specific demo destinations in both languages. Actual RegisterRoute tests prove only scalar mode=login selects login; unsupported/array/missing modes remain registration and sensitive query keys are ignored.

Added accessible to both notice Views: an alert role alone did not expose the host View to the accessibility tree. Tests now resolve the actual alert by role while asserting localized visible copy. No API, credential or login state was added.

## Verification

- Final full mobile Jest suite: 19 suites, 106 tests PASS with NODE_PATH scoped to apps/mobile/node_modules; no skips.
- Focused registration suite: 12 tests PASS.
- Mobile ESLint and strict TypeScript PASS.
- Independent architect-client/QA source review APPROVE, no blocker. Optional accepted-identifier Swedish-copy coverage noted; bilingual login/welcome routes covered.
- Native Android/iOS validation remains deferred, not passed. Tests/mock routing do not establish complete signup, backend or provider authority.

Initial full author run identified the alert-tree issue; correcting test semantics exposed and fixed the underlying accessible View requirement. Root's first final-run invocation passed an invalid Jest CLI separator and ran no tests; the corrected exec jest --runInBand command above ran all 19 suites. Existing reduced-motion act warnings remain in an unrelated passing suite; no warnings/tests were suppressed.

Task ST-051d remains IN_PROGRESS pending its broader runtime/review/CI acceptance. This focused change does not accept the whole WIP handoff or authorize merge/deployment.
