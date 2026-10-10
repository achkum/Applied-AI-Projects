1. Scope: future private-development web only; accepted mandatory simulator BankID and D12 anonymous mobile OTP restriction remain.
2. Persist bounded idempotency key burn first; duplicates409 never replay proof/session/CSRF.
3. Resolve normalized contact/channel/challenge from coherent server OTP metadata, not client identity selectors.
4. Atomically consume restricted enrollment OTP proof and create expiry-bound pending enrollment; OTP grants no login.
5. Verify simulator server-side outside account locks; store separate authoritative one-use enrollment record with subject/verified-at/names and exact pending bindings.
6. Contract server-owned same-chain transition to session-purpose nonce; bind it to authoritative enrollment and HttpOnly cookie.
7. Generate session/refresh/CSRF secrets in memory before commit; persist only digests, never return before commit.
8. Begin one PG transaction; lock owned pending reservation, authoritative enrollment and nonce; recheck binding/clock/expiry.
9. Use existing provisioner SELECT(id,external_id)/INSERT only; unique external_id dedup, no UPDATE/DELETE or content access.
10. Existing subject means explicit Log in instead, no contact/profile overwrite or session; concurrent insertion loser follows that path.
11. For new subject locally switch to ordinary runtime, set both RequestContext owner settings from inserted server id; check active owner.
12. Write private verified fields/contact/profile defaults and v2 session/family/CSRF, terminally consume authoritative proof+nonce, settle completed together.
13. Any precommit failure rolls back account/session/consumption; fail owned burned reservation separately; crash leaves bounded pending burn.
14. Uncertain commit or lost response never retries/compensates account; fresh verified login/nonce, orphan session expires or owner revokes.
15. Async ports await bounded snapshots; unsafe writes recheck current owner/session/CSRF in mutation transaction; no active-owner cache.
16. Refresh transaction locks matched credential/family/owner, checks transport/binding/CSRF, tombstones old hash, writes successor+CSRF+settlement; reuse revokes family.
17. Persist auth state/key epoch/clock watermark; same-epoch restart retains burns/current owner, mismatched keys or clocks fail closed.
18. Reload recovers CSRF only through reviewed exact-Origin/cookie-bound current-session replacement operation, otherwise fresh login.
19. Profile owner writes persist reviewed display/avatar/language/theme/Just me; no household/member/consent creation; native separate.
20. Contracts→schema/access classification→async account→durable sessions→isolated HTTPS→web UI; independent reviews/QA/exact CI precede acceptance, no activation here.
