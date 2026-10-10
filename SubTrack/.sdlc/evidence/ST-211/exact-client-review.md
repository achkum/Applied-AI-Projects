contract: REVIEW/v1
task_id: ST-211; reviewer: architect-client; verdict: APPROVE; date: 2026-10-10
scope: PR #239 exact head e8a601021a66c9d774974ba3aa6e8ac65d85a0b8; bounded development client/source and actual routes only.
source_sha256_lf: mobileEnrollmentOtp.ts=24aebb3714629a70dad4bb2252e8b612dfb93443920c8c720c10e623e79ed6e2; EnrollmentFlow.tsx=ac07950da73306d6a2d60bef7d09736ade167a7bb2bf1efb14c3dc5588b9f49f.
route_sha256_lf: register.tsx=04f641cfe86a73fbf97fcf175e495cadd48fd8a47b657bdc2e2ef0f0ca09d4f6; register-otp.tsx=facafd0b984da393d9a2246988eaafeee79ec89d9d9a5d80d880d0d085348d22; register-bankid.tsx=a56aa0aef0ecda4d4e37ca772707a09a3328f1adda8a2024ec4b31a745e64b8c; _layout.tsx=74b1b771b4364cbc6a7cb788b36c9699263d2c0583793b86f8578efcee16289f.
design_sha256_lf: IdentifierEntry.tsx=12d76b646959d22229e098c5c5c065e3b7614456c7dc249e2fabda55843edc41; RegistrationScreen.tsx=3b2865ec80365f214fc2ac77f492f6df98954a4a89d41f61a73f406569f9867f.
review: Exact typed start/verify bodies and responses, native development HTTPS gate, fresh 32-byte key per action, no retry or credential/secret persistence, generation reset, direct-entry guards, and restricted BankID proof gate rechecked; design fixes are 48pt channel targets, raised form card, and OTP mono token, with no auth-logic change.
findings: Prior minor opaque 401 incorrect-versus-terminal retry ambiguity remains; see client-review.md and security-review.md. Earlier client-review.md API hash contains a transcription error; the full LF hash above is independently recomputed and matches security-review.md.
evidence: QA 22 suites/129 tests, lint/typecheck/parity and changed-source coverage >=80% PASS; focused design-fix 29 tests PASS per existing receipts. No heavy suite rerun in this review.
limits: Native fetch/TLS/device trust, real delivery, BankID provider and full UF-01/02 are unproved; exact-head CI and both rate-limited Vercel checks remain merge gates. This is not production approval.
