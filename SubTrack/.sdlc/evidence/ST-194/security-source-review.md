# ST194 security/privacy source review

**Decision: APPROVE** for the explicitly opted-in development HTTPS bridge and the existing web `DELETE /v2/me/sessions/{id}` branch. No blocking security/privacy finding in the frozen four-file source. This approval does not authorize default application registration, production exposure, a durable session guarantee, or broader session-management behavior.

The request path requires an actual `TLSSocket`, exact configured HTTPS Origin evidence and the distinct binding cookie; it rejects ambiguous raw headers, query/body/framing, alternate credentials/CSRF selectors, duplicate cookies, and any refresh cookie. Access claims are verified and copied from own data before being used only to locate the current web session. A resolved principal must match those claims, and the session row plus origin/binding/chain are synchronously reread and fully rebound after the async resolve and before CSRF or mutation. Expiry is checked both before and after the await. CSRF must synchronously return `void` before the repository's atomic owner-scoped revoke. The response distinguishes only the specified missing/invalid/capacity outcomes. Self-revoke invalidates only the requesting principal's CSRF after commit; failures do not restore state or claim rollback. Native-promise checks, descriptor-safe snapshots, bounded origin throttling, no-store handling, and explicit module registration support the stated boundary.

The two source files and both specs match the frozen fingerprint manifest. Per supplied QA evidence, actual HTTPS bootstrap/refresh/revoke, parser/default-404 behavior, focused/API checks, lint, typecheck, and build passed. The no-refresh-cookie selector is intentionally stricter and is covered by the HTTPS spec. The rejection of refresh cookies avoids credential ambiguity on this protected route.

- `apps/api/src/auth/sessions-v2/v2-web-revocation-http.ts` — `12c105ea854b3f3204123aeb26e87b19642e62a35f0743822bc32ac1f5d325d4`
- `apps/api/src/auth/sessions-v2/v2-web-revocation-http.module.ts` — `f4ba5407705f49a4a21e240d7b715afe1915f32b6ba769d8589371a711260790`
- `apps/api/src/auth/sessions-v2/v2-web-revocation-http.spec.ts` — `62fd67a97889a8848ce34fcc6d32ca6212787bdbc45b1356cd042ed0b9e4d886`
- `apps/api/test/v2-web-revocation-http.spec.ts` — `9abf73e1e57bb211c532ad31597bf1245821d3c6cb41778217e22f6ac51b1f08`
