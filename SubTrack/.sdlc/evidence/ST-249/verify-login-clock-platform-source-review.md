# ST249 trusted simulator clock PLATFORM SOURCE review

2026-10-14 independent reviewer sandbox_delivery_audit. **SOURCE GO for exactly four hashes in verify-login-clock-source-handoff.md**, independently recalculated/matched. No tests, source/Git/SQL/Docker/hosted/remote mutations by reviewer. Actual subsequent causal PG qualification is still required.

Actual diff adds only constructor trusted clock default dynamic ()=>Date.now(), rejects nonfunction, stamps original simulator-issued verifiedAt with that clock and passes ()=>this.readTime() from the development verifier. HMAC derivation/secret/key copy, registered names/fixed selector/case handling/BANKID method/result shape remain. Constructor-only graph configuration introduces no user/environment/provider parameter or runtime factory/fixture/epoch/SQL change. Ordinary simulator call sites retain wall time; verifier finite/nonnegative/Date-safe/monotonic before/during/after time checks and exact future/age/freshness/output shape conditions remain unchanged. No posthoc evidence rewriting or future-timestamp acceptance bypass.

Actual tests meaningfully exercise real unmocked simulator/verifier one-hour-behind clock while host Date.now remains real, exact original HMAC/name/method/immutable result, ordinary default wall bracket and rejection of invalid/throwing/regressing issuance clocks. Existing malformed/hostile/future/stale/model gates remain. Author records60focusedtests/100% changed-source coverage/types/lint; this independent read did not rerun them or substitute fixture results. Standalone simulator preserves generic trusted clock errors, while development verifier catches as its unchanged fixed unavailable error; no private output/API behavior expansion.

Reviewed hashes:

* bankid-simulator.ts:6ca9c3f0b431747a834ec17c7bffb9811b576a15f1aa3cd8736337fde9d13ac6
* bankid-simulator.spec.ts:f7fd233d854db509644ae2b17978cfc23936dc053d32d30a615a927a3458812d
* development-enrollment-person-verifier.ts:33c2982c62f441a52f3f92f557760dca320130b60ce660f277577a7235ce969f
* development-enrollment-person-verifier.spec.ts:19a8ec18637f144a83d281fcab5ea23341cc98e38e728ff0dedae31cc5fb300e

No additional platform SOURCE blocker in this bounded repair. Public sandbox/production authority and native acceptance remain separate.
