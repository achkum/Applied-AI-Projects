# ST-178 source-bound security/privacy review

Verdict: APPROVE — the previously reported context snapshot blocker is fixed in this reviewed source. This is a bounded internal development-reference review only; it does not approve production wiring or claim real BankID/provider verification.

Reviewed at base `cdbe087e1c1d01be836c3bb25d6d64272b4b6f4b` (final working-tree source):
- `apps/api/src/auth/proofs-v2/bankid-simulator-proof-producer.ts` — 103 lines; SHA-256 `e287f23db13880b35d0affc91fee1a90bf118aca944c959d7f3b28df28a8caf6`.
- `apps/api/src/auth/proofs-v2/bankid-simulator-proof-producer.spec.ts` — 215 lines; SHA-256 `1f44bf860438ba5163ccef651c6958e26a5208378e87c38a0f7cc49eb843e2a8`.

The source now snapshots own data descriptors once, rejects non-plain objects, symbols, accessors, and non-enumerable properties, and validates only the copied null-prototype snapshot. Provider results use the same approach and are reduced to frozen method/HMAC/timestamp fields. Added tests cover getters, symbol/hidden/inherited/prototype-shaped extras and ensure invalid context fails before simulator, resolver, or proof issuance. This closes the finding recorded in the prior review.

Other reviewed controls remain sound for the approved scope: fixed `verify('alice')`; no caller fixture/result/identity selector; HMAC-only resolver lookup and canonical UUID validation; generic caught errors; result freshness checked after provider and again after awaited resolver; login-only ProofStore binding with random challenge and returned opaque secret. Copied key is converted to hex, a lossless explicit representation for the simulator's string-key API. OTP proof purpose remains separate.

No checks executed by this reviewer (no tests, build, lint, or runtime checks). Review was source inspection only. The implementation author/root reports CI-style checks underway; that report is separate from this review.
