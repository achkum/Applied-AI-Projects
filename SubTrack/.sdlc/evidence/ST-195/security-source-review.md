# ST-195 security source review

**Decision: APPROVE — Type 2a, limited to the reviewed development-only adapter.** Source gate fingerprints match the frozen manifest. The adapter requires explicit development/enabled configuration and direct TLS, accepts one canonical bounded Bearer token, rejects cookies and browser aliases, query/body/framing inputs, then verifies the real v2 claims both before and after principal resolution. It checks the fresh claims against the resolved identity/session and synchronously lists current owner-scoped sessions. Output validation rejects malformed descriptors, duplicate IDs, invalid ordering/dates, and an absent or mismatched current session. Responses set no-store/no-cache, expose only summaries, and emit no cookies. The opt-in module leaves the default application route absent and covers parser errors without caching.

Approval is bounded to this source set and its existing development/native gates. Keep the mobile route opt-in, preserve the production and native readiness gates separately, and do not treat this review as production, provider, database, or client approval. The reported focused tests and lint/typecheck/build results are accepted as supplied; I did not rerun them.

| Frozen source path | SHA-256 |
|---|---|
| `apps/api/src/auth/sessions-v2/v2-mobile-listing-http.ts` | `574100b6963aea34733bf70446cd6f592a1a0de180f07099562d3a33deca3489` |
| `apps/api/src/auth/sessions-v2/v2-mobile-listing-http.module.ts` | `a1f4789b88855720b02b41663863f18ddd9cfad4de72b7206a27798e7bfb852a` |
| `apps/api/src/auth/sessions-v2/v2-mobile-listing-http.spec.ts` | `6a76df24a3fed7ec52ab3908fd1906f6c13384a4b6f6c01bd67a381892632e1f` |
| `apps/api/test/v2-mobile-listing-http.spec.ts` | `7980c12526769e1a581e3018fde9bde50a4415b84500e06777c733220d77e10f` |
