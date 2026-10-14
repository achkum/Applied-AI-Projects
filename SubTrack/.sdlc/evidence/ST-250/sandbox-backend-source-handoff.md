# ST250 persistent sandbox backend source handoff

2026-10-14. Source phase only; no SQL, remote deployment, Git mutation, public exposure or secret creation performed by this author. Independent platform/privacy SOURCE review and actual PostgreSQL/ingress/device qualification remain required.

## Implemented slice
Five strict POST routes isolate sandbox bootstrap, resume, refresh, logout and the existing eight manual/profile/Just Me business operations. New signing/capability/refresh/admission namespaces, 30-day immutable capability, 24-hour bounded sessions and 15-minute access are independent of private development and production authority. The shared business function changes only its authority annotation to a structural Pick; original business SQL and private class gates remain intact.

Source includes strict raw duplicate-key JSON/UTF-8/body/header framing, mounted gateway secret and trusted source binding, bounded admission rates/hot-state and HTTP/DB work, durable current capability/session checks before replay, and global-capacity then owner/capability/session locking. Bootstrap burns global one-use admission before creation, refresh consumes old digest atomically and revokes a reused family; uncertain commit/reset/rollback withholds disclosure. Logout revokes the workspace capability and every session while retaining subscription data.

Final durable epoch/current checks are awaited before the last synchronous JWT/time guard; no await or caller callback occurs between that final guard and COMMIT dispatch. Newly issued credentials are reverified for their expected owner/session and second-based JWT expiry, including the last time read. Native clocks retain real wall time. No access-clock or credential debug override exists in runtime source.

Two separate SQL sources retain composite owner/subscription receipt FKs, forced RLS, narrow finite grants, nonlogin non-BYPASS definer ownership and fixed search paths. Capacity growth is guarded in storage triggers as well as app admission. The dedicated startup checks role/migration/forced-RLS roster and epoch/key/DDL manifest before listen. It never loads SQL or falls back to a proof/Nest entrypoint.

## Validation actually run
- Strict sandbox contract: 5 Node tests with enforced 100% contract lines/branches/functions; PASS.
- OpenAPI Redocly lint including five routes, credentials, eight business payloads and closed problem schema: PASS.
- Five API policy files: 39 Vitest tests; enforced 100% of 645 statements, 511 branches, 75 functions and 128 lines; PASS at 09:45 UTC.
- API direct TypeScript no-emit and scoped ESLint including sandbox source/tests and shared business annotation: PASS at 09:45 UTC.
- Tests cover actual crypto namespace/signature rejection, final awaited expiry and synchronous COMMIT ordering, open/pending transaction-port rejection, unknown commit/rollback/reset withholding, issuance cap equality, consumed refresh replay, logout revocation, strict JSON and header framing, one-hour bootstrap retention after idle windows, global/source rates and disconnected/timed-out response withholding.

These are controlled source policy units, not a claim that SQL or installed apps have executed. Generated clients are conductor-curated; no generated file was hand-edited by this author. Compilation to the deployed dist entrypoint, migration/custody qualification and real persistent owner/restart readback remain conductor execution prerequisites. Public/startup activation requires complete source and deployment gates.

## Exact source SHA-256 roster

| App-relative path | SHA-256 |
| --- | --- |
| `packages/contracts/openapi.yaml` | `f8414e826d694c8545ad32bcd1a895bfe94086955eaec0902ff22d343726f013` |
| `packages/contracts/sandbox-mobile.ts` | `e532496867642ce6c6f7ebfb8337ee33175fbd0b750ea493744caeff0b3c7529` |
| `packages/contracts/tests/sandbox-mobile.test.mjs` | `b8d04ccf933668ece308986b169d431b731069d2e87a52e2f6af4b97594468ef` |
| `packages/contracts/package.json` | `c4bd9f31ae2bb5e15f6285e242ffe390cad9a47c91cf9ab5b45954cbdde398ad` |
| `apps/api/src/profile/private-mobile-business.ts` | `440a302344adc6c4d7fbdb9398132ff7ea802153b9c34f409f14e8aaf0a9bad9` |
| `apps/api/src/sandbox/main.ts` | `b38f29fd8d4fffb99c8ad703a5c79ea7c4499ce30e01481fe2877438b64b2456` |
| `apps/api/prisma/sandbox/001-sandbox-foundation.sql` | `e851ef39ba5da5d1856cf83b1096d0dfad8973b815d3647e694e190e3f5a29eb` |
| `apps/api/prisma/sandbox/002-sandbox-mobile-business.sql` | `398bcf151a8f983bef5edf843c1dd9adeeb027cc204cd0aa100f070c7178c8d0` |
| `apps/api/src/sandbox/sandbox-authority.spec.ts` | `b99613e584143bc38e40ce4de06bec646b981293a0520290c1ac8cdc75445c54` |
| `apps/api/src/sandbox/sandbox-authority.ts` | `71702ce03a135b4450f315b54cecf693a50c19aeccaab6fee4f9c166a1f5a5fc` |
| `apps/api/src/sandbox/sandbox-config.spec.ts` | `6fb1c7b06354d840f5352bceda77b3c2e3e0ba0ba5fa86b4a785bd3db47bb4d0` |
| `apps/api/src/sandbox/sandbox-config.ts` | `9db89c3a85e66ade900c99aea1ce9d05f203df0410aa2ce5c8e43308014f1be6` |
| `apps/api/src/sandbox/sandbox-http.spec.ts` | `210fa22ebaa69818d829d35c50db5b63a6029c8d9c053564b6a82a63700925e6` |
| `apps/api/src/sandbox/sandbox-http.ts` | `0fd9cc584101cc82570dbdadef7ae36eb3831df428567191be26c89789b9064f` |
| `apps/api/src/sandbox/sandbox-session.spec.ts` | `75013b00aafd9c8b620e3c6051bc26da937a0a29970bb4687452223ab6b06a6a` |
| `apps/api/src/sandbox/sandbox-session.ts` | `6036bd8a7c3563da5ff52a653853fd201f6dbbe7d7a9710e235a9f4ac807c843` |
| `apps/api/src/sandbox/sandbox-token.spec.ts` | `08c1053ebac87d3719708dae0bd9f4ef723193524a705f6e6f2e913d7c6ea318` |
| `apps/api/src/sandbox/sandbox-token.ts` | `c81ef391f78350f3bdde939988e489de1f70f627bb70ebf46d888d0dfe9ccced` |

## Platform HOLD repair

The foundation source now grants USAGE on public only to the existing subtrack_sandbox_owner NOLOGIN/NOSUPERUSER/NOBYPASSRLS definer role, in addition to the two existing application roles. No CREATE, role membership, login, EXECUTE or table privileges were added. Both lock_owner(uuid) and guard_growth() are owned by this role, retain fixed pg_catalog search_path, schema-qualified public references, FORCE RLS and PUBLIC EXECUTE revocation. The former executes public.subtrack_principal_matches and locks public.identity; the latter counts/locks public.identity and accesses subscription/receipt tables. Both require schema USAGE for those references. Source inspection confirms these exact paths; no SQL execution or repeated broad tests were performed for this one-line grant repair.
