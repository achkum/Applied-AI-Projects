# ST-213 architecture and threat-boundary readiness
1. Reuse the accepted ST-212 controller, guard, resolver, reader, repository, service, and wire contract; no auth or product scope change.
2. Build one Nest factory receiving an explicit verifier and a single runtime Prisma client; expose init/listen/close without a testing override.
3. Register only the three existing subscription GET routes; keep default `AppModule`, v2 auth, contracts, and web graph unchanged.
4. A dev wrapper requires an explicit development switch and binds numeric `127.0.0.1` on a loopback-only port.
5. The wrapper creates its own new labelled tmpfs PG16 container, random loopback database port, canonical migrations, and distinct ordinary runtime login.
6. Obtain URLs only from that creation; ignore inherited `DATABASE_URL` and refuse pre-existing/user-selected databases or marker-only proof.
7. Verify container identity/binding and database name, runtime role nonowner/non-superuser/non-BYPASSRLS, grants, and RLS before `listen`.
8. Reject missing switch, wrong bind, wrong role/DB, unavailable verifier, or failed validation before opening the HTTP listener.
9. Keep fixture credentials private, never log tokens/IDs/URLs, and sanitize receipts; PASS requires verified fixture/temp cleanup.
10. The wrapper has no issuer/provider/cookie bridge or account, household, lifecycle, or write endpoints.
11. The existing PG test passes its ephemeral verifier into this same factory; synthetic tokens stay in memory only.
12. Preserve actual HTTP owner/peer/private/inbox, filters/cursor/bigint, revoked-session, RLS, and pooled-GUC checks.
13. Add meaningful startup fail-closed and composition tests, then API lint/typecheck/regression and changed-source coverage.
14. Security readiness before implementation; independent platform/security/source and actual-PG QA plus exact-head gates before merge.
15. This yields only a developer service; user-facing login, credential transport, and web wiring require later review.
