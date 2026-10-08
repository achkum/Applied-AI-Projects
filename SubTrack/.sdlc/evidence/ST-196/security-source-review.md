# ST-196 security source review

**Decision: APPROVE.** The implementation follows the approved Type 2a, development-only plan. It accepts one canonical Bearer credential over direct TLS, rejects cookies, browser headers, query/body input, ambiguous framing, and noncanonical tokens, then verifies the same token before and after genuine asynchronous mobile-principal resolution. Fresh claims must match the principal, and the complete live mobile caller row is checked immediately before the synchronous atomic owner/current/target revocation. No await separates that row check from commit. Unknown and foreign targets share the generic 404; success is empty 204 with no cookie; responses are non-cacheable. The module is explicitly registered and isolated, with an actual default-app 404 check. No CSRF/cookie cleanup, idempotency, production registration, or retry-safety claim was added. The two controller files must remain exclusive route owners; the mobile and web DELETE controllers cannot be co-registered.

Source fingerprints match `.setup/ST196-source-fingerprints.json`:

- `apps/api/src/auth/sessions-v2/v2-mobile-revocation-http.ts` — `fa6b30f27bd5ea832678a23142e3c0fd3edbd81b46c8c0b6e2a0cf07368dcf59`
- `apps/api/src/auth/sessions-v2/v2-mobile-revocation-http.module.ts` — `2001d41005cc43ace2c0e4107145c89f6925c27f830a744d642b497c1c48a14f`
- `apps/api/src/auth/sessions-v2/v2-mobile-revocation-http.spec.ts` — `b17004993f27e61081e2469df3cef071e687b6ea8a7a69af4908f765c8b0bf91`
- `apps/api/test/v2-mobile-revocation-http.spec.ts` — `4d6bca9b9af4c045635b4ea7b1942121936e3bad8e8edb531c92192975a2fb94`

Review basis: exact task, repository instructions, Constitution, Decision Rules, ADR-0010, both independent plan reviews, root QA evidence, and all four frozen source files. No tests rerun. Tool accounting: 3 underlying `exec_command` calls; 1 artifact write; 1 final handoff message.
