# ST194 platform source review

**Decision: APPROVE.** The frozen four-file implementation matches the approved Type 2a plan: explicit development opt-in, isolated registration, and default application 404. No mandatory platform finding remains.

Authority starts with strict verified JWT claim snapshots; `sub`/`sid` come only from those claims. The synchronous full-binding web-context lookup is only a transport lookup. The code awaits the shared principal resolver, matches its identity/session to the claims, then obtains a fresh nonregressing time and rechecks the full owned live row/context before CSRF verification and atomic repository revocation. Strict descriptor snapshots and native-Promise validation fail closed. Parsing rejects ambiguous raw headers/cookies, malformed inputs, query/body/framing, bearer/mobile aliases, and any refresh cookie, as the protected credential selector requires.

Revocation uses the real principal identity as owner scope. Missing and foreign targets share the 404 result; capacity and malformed collaborator results fail closed without guessing rollback. Self-CSRF invalidation occurs only after commit; failure leaves revocation committed and returns a generic failure. Sibling revocation preserves caller CSRF. Tests cover consumed-history/capacity preservation, await-time caller deletion, post-commit invalidation failure, and response delivery failure without restoration. Actual HTTPS coverage exercises bootstrap, refresh, revocation, refresh-cookie rejection, no-store responses, and default 404. Root QA reports 898 API tests, 40 focused cases, lint, typecheck, and build passing; this review did not rerun them. Production readiness, cross-operation atomicity, target-chain CSRF cleanup, and rollback after commit are not claimed.

## Frozen source fingerprints

- `apps/api/src/auth/sessions-v2/v2-web-revocation-http.ts` — `12c105ea854b3f3204123aeb26e87b19642e62a35f0743822bc32ac1f5d325d4`
- `apps/api/src/auth/sessions-v2/v2-web-revocation-http.module.ts` — `f4ba5407705f49a4a21e240d7b715afe1915f32b6ba769d8589371a711260790`
- `apps/api/src/auth/sessions-v2/v2-web-revocation-http.spec.ts` — `62fd67a97889a8848ce34fcc6d32ca6212787bdbc45b1356cd042ed0b9e4d886`
- `apps/api/test/v2-web-revocation-http.spec.ts` — `9abf73e1e57bb211c532ad31597bf1245821d3c6cb41778217e22f6ac51b1f08`
