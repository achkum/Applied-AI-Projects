# ST-178 platform source review

Verdict: **APPROVE.** The frozen source matches the approved internal development-only fixed-fixture producer boundary, including the context descriptor hardening raised in security review. No blocking source defect found.

- Context and provider result are snapshotted from own enumerable data descriptors into null-prototype records. Symbols, accessors, non-enumerable fields, inherited/prototype-shaped objects, and unknown keys are rejected without invoking getters; validated context is frozen.
- Provider result is reduced to a frozen `BANKID` / HMAC / canonical timestamp snapshot, dropping fixture name and preventing getter/TOCTOU changes.
- Constructor requires explicit development environment, enabled flag, and a copied simulator HMAC key of at least 32 bytes. Provider call stays fixed to `verify('alice')`; resolver receives only the lowercase 64-hex HMAC.
- Freshness is checked after provider completion and after registered-identity lookup immediately before issuance. The proof uses a fresh random challenge, `login` purpose, resolver identity, and validated web/mobile binding. Errors remain generic.
- Regression tests prove malformed context rejects before provider/resolver calls and the context getter is never invoked. Existing coverage includes lookup-delay staleness, clocks, boundary timestamps, fixture, transport binding, consume-once, and OTP purpose separation.
- Scope remains internal: no HTTP/runtime wiring, production enablement, durable storage, session issuance, or contract changes.
- Source review only; full QA outcome is owned by root and not claimed here.

SHA-256 manifest:
- `apps/api/src/auth/proofs-v2/bankid-simulator-proof-producer.ts`: `e287f23db13880b35d0affc91fee1a90bf118aca944c959d7f3b28df28a8caf6`
- `apps/api/src/auth/proofs-v2/bankid-simulator-proof-producer.spec.ts`: `1f44bf860438ba5163ccef651c6958e26a5208378e87c38a0f7cc49eb843e2a8`

This refresh used 2 tool calls, as required. No source or Git edits made. Reviewed checkout head: `cdbe087e1c1d01be836c3bb25d6d64272b4b6f4b`; source/spec remain untracked in the working tree.
