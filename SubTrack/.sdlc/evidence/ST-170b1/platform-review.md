# ST170b1 Platform Review

**Final decision: APPROVE**

Reviewed the final staged `proof-store.ts` and `proof-store.spec.ts` with the supplied coverage summary, against the staged task and prior contract review. Scope remains the internal typed proof core. This review does not assess runtime endpoint/provider readiness, production storage implementation, deployment, or database readiness.

## Findings

No blocking or non-blocking findings.

The core uses a 32-byte random secret with the `v2.` prefix, persists only a domain-separated SHA-256 hash, derives action from purpose, copies/freezes bindings, and fixes expiry to five minutes. Consume maps malformed scopes, unknown/replayed/expired proofs, invalid clocks, and repository errors to the same frozen `{ valid: false }` result. Issue now also maps repository insertion failures to the generic `Proof unavailable` error. The in-memory reference repository’s compare/delete remains synchronous with no await between comparison and deletion; the interface documents the atomicity requirement for durable implementations, and the class is explicitly test/dev only.

Bindings require identity for login and account deletion, session for account deletion, and identifier hash for enrollment/step-up. Web bindings require a canonical HTTPS origin or HTTP loopback origin plus browser-chain ID; mobile rejects browser-only fields. Action remains derived from purpose, preserving contract purpose separation and preventing enrollment/step-up OTP proofs from being used as login proofs. The API remains a usable core boundary for future trusted producer/session exchange integration and does not claim that integration is complete.

## Test and coverage evidence

The final spec contains **60 parameterized/concrete test cases across 14 test declarations**, covering hash/secret/TTL, concurrency and replay, scope substitution and mutation, required bindings, runtime malformed input, canonical origin validation, generic errors, and corrupted expiry/action records. The supplied `coverage-summary.json` reports **100% lines (58/58), statements (83/83), functions (11/11), and branches (108/108)** for `proof-store.ts`. These are reported from the supplied summary; I did not run tests or coverage.
