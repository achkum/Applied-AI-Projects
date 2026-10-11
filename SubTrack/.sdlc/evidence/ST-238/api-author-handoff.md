# ST-238 API and contract author handoff

Source author handoff only; this is not independent review, actual PostgreSQL proof, browser QA, or merge approval. Base was accepted ST-237 `2f55e95b6bdc5340b01b0de68dbf42900f073b6d`. No commit made.

## Contract and exports

`packages/contracts/openapi.yaml` freezes private opt-in POST `/v2/me/mode` and `/v2/me/mode/read`, POST `/v2/subscriptions/owner/read`, plus private owner-only behavior on the reused detail POST and lifecycle PATCH. New success and problem schemas are closed and no-store/no-cache. All routes retain `x-runtime-availability: unavailable-default`; only the private HTTPS launcher may mount them. The reused detail/status operations retain their accepted default response refs and expose the private opt-in response and exact code matrix as `x-private-https-responses` and `x-private-https-problem-codes`. This preserves old generated/contract assertions while making the mounted private variant explicit. Generated SDK, types and Zod were regenerated from OpenAPI.

`@subtrack/contracts/private-onboarding` exports `parseModeView`, `parsePrivateOwnerPageRequest`, `parsePrivateOwnerView`, `parsePrivateOwnerPage`, and `parsePrivateLifecycleResult`. These enforce own-key closed JSON, canonical owner UUID and bigint-string money, owner discriminator, enum/date/currency validation, a 50-item unique-ID page, and bounded cursor syntax. Client author was notified of the public package subpath and signatures.

`PRIVATE_ONBOARDING_STATEMENTS` installs exactly `modeRead`, `modeChoose`, `ownerList`, `ownerDetail`, `ownerStatusLock`, and `ownerStatusCompareUpdate`. SQL contains no quotes, comments or transaction/GUC statements. Every subscription query has an explicit owner identity predicate. List queries 51 rows and preserves PostgreSQL microseconds using server-bound `UTC` and `YYYY-MM-DD"T"HH24:MI:SS.US"Z"` format arguments: `ownerList` takes `[ownerId, afterCreatedAt|null, afterId|null, timezone, format]`, and `ownerDetail` takes `[ownerId, id, timezone, format]`. Storage/launcher author was notified of this signature extension to the platform minimum, the export, and route dispatch.

`createPrivateOnboardingHttp(authority).handle(req,res)` accepts only the five reviewed method/path forms. It uses existing private wire/body parsers, then the existing current-web authority. Mode choice conditionally writes only for a complete profile with null mode; identical repeat performs no update and returns a committed readback. Every subscription callback rereads the currently complete profile and persisted just-me mode before querying. Domain missing/conflict outcomes are returned from the callback and mapped to 404/409 only after the authority resolves. Callback/commit failures collapse to 401. Detail and lock/update bind both owner and row ID. Status transitions use the frozen matrix after row lock and compare-update. List cursor includes only version, endpoint, six-digit timestamp and ID, with canonical base64url re-encoding; it never selects authority. `nextCursor` is derived from the last displayed row only when row 51 exists.

## Verification

- Redocly spec lint passed after contract extension; OpenAPI generation completed.
- Contract TypeScript and API TypeScript checks passed.
- Focused contract tests passed after the final extension and regeneration: 12 tests across new private and existing profile/browser detail/browser lifecycle suites.
- Focused API Vitest passed: eight tests cover SQL guard, wire denial before authority, incomplete/repeat choice, unknown commit, committed 404/409, locked transition and exact 50/51 microsecond cursor behavior. ESLint for the three API source/test files passed.

The API tests use controlled authority callbacks and bypass actual TLS for handler behavior; actual PostgreSQL, RLS, private HTTPS and browser proofs remain with storage/actual QA. Independent source review must check the OpenAPI private extension against the mounted response behavior and the qualified catalog grants for the merchant join. No self-approval is claimed.
