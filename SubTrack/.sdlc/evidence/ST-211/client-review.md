# ST-211 independent architect-client source review — 2026-10-10
contract: REVIEW/v1
task_id: ST-211
reviewer: architect-client
verdict: APPROVE
scope: Development mobile client/source and desktop test evidence only; native device/TLS, delivery, provider and whole UF-01/02 remain gated.
base: main 007e620732e19c1157c73972e7d07c2b3d0537f8; uncommitted worktree source reviewed.
source_sha256: mobileEnrollmentOtp.ts 24aebb3714629a70dad4bb2252e8b612dfb93443920c10e623e79ed6e2; EnrollmentFlow.tsx ac07950da73306d6a2d60bef7d09736ade167a7bb2bf1efb14c3dc5588b9f49f.
route_sha256: register-otp.tsx adabb1aee0bbcc0fdc3d68e813d8b66b77a6fe391725c8ab3151c2fc7769c772; register-bankid.tsx a56aa0aef0ecda4d4e37ca772707a09a3328f1adda8a2024ec4b31a745e64b8c.
findings:
  - severity: minor
    file: SubTrack/apps/mobile/src/api/mobileEnrollmentOtp.ts:102
    issue: Verify HTTP 401 maps to retryable incorrect, while accepted development API also emits 401 when its challenge becomes terminal (mobile-enrollment-otp-http.ts:261). UI can invite one futile same-challenge retry before 409 resets it; wire response intentionally does not distinguish those states.
    fix: Keep opaque public errors; consider generic restart guidance after repeated 401 or a separately reviewed server signal. No new client authority is implied.
evidence: Generated typed paths/bodies; static Expo opt-in, native-only development HTTPS URL gate; async 32-byte random key each action; no automatic retry, credentials or secrets in URLs/storage/logs. Flow epoch, path cleanup, direct-entry guards and BankID proof gate reviewed.
tests: Author checkpoint reports 22 mobile suites/127 tests, lint/typecheck/parity PASS and changed-source coverage >=80%; reviewer did not rerun heavy jobs. Route/flow/client tests inspected, including stale reset and bilingual rendering.
limits: React Native fetch header behavior, direct TLS/device trust and actual native runtime remain unevidenced; desktop/web checks cannot establish them. Exact-head QA, security/design review and CI remain independent gates.
