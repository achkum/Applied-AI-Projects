# ST-211 bounded QA receipt
Date: 2026-10-10; branch: st/ST-211-mobile-enrollment-routes.
Inherited post-format full QA: 22 suites / 129 tests PASS; lint, typecheck, i18n parity PASS; coverage 89.25% statements, 83.55% branches, 90.4% lines (not rerun here).
`expo-web-smoke.cjs` result PASS: four en/sv × light/dark contexts, 375×812; 48 requests, 0 external/auth/identifier requests, 0 page errors.
OTP/BankID test-only React state fixture PASS for four contexts, eight actual-route screenshots; synthetic in-memory identifier/challenge/proof only.
Registration route assertions passed; after the bounded HMR-hidden wait, the registration PNG was blank and is not accepted as visual evidence. See compact `expo-web-smoke-delta.json`.
No runtime/provider/native/TLS/delivery/accessibility claim; OTP/BankID remain desktop visual fixtures only.
Current LF-normalized SHA-256: IdentifierEntry.tsx=12d76b646959d22229e098c5c5c065e3b7614456c7dc249e2fabda55843edc41; RegistrationScreen.tsx=3b2865ec80365f214fc2ac77f492f6df98954a4a89d41f61a73f406569f9867f; register-otp.tsx=facafd0b984da393d9a2246988eaafeee79ec89d9d9a5d80d880d0d085348d22.
Reproduction delta: `expo-web-smoke-delta.patch` adds only a bounded wait for the Expo `Refreshing...` indicator before screenshots; source harness remains local.
Only ST-211 evidence was changed by QA; app/runtime source unchanged.
Design delta: APPROVE scoped design review; prior minor findings are resolved (48pt channel targets, raised identifier card, OTP mono token). Inspected all 8 renewed post-fix OTP/BankID actual route captures across en/sv and light/dark; all clean with no HMR overlay. Design review saw the raised card beneath the earlier HMR overlay; the latest bounded recapture was blank and is not accepted as screenshot evidence.
LF-normalized SHA-256: IdentifierEntry.tsx=12d76b646959d22229e098c5c5c065e3b7614456c7dc249e2fabda55843edc41; RegistrationScreen.tsx=3b2865ec80365f214fc2ac77f492f6df98954a4a89d41f61a73f406569f9867f; register-otp.tsx=facafd0b984da393d9a2246988eaafeee79ec89d9d9a5d80d880d0d085348d22
