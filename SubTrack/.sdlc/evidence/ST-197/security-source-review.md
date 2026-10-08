# ST-197 Security and Privacy Source Review

**Decision: APPROVE**

The frozen implementation satisfies the reviewed security conditions for the development-only, opt-in unified revocation route. No blocking source findings were identified.

The dispatcher classifies credentials from `request.rawHeaders`, preserving duplicate header and cookie evidence. It rejects malformed cookie syntax and duplicate cookie names, passes lossless recognized credential counts to `selectV2CredentialTransport('revokeV2Session', ...)`, then rejects any Cookie header on mobile and requires exactly one Cookie header for web. The selector and adapter reject empty, duplicate, mixed, and unknown credential branches before service delegation. Web requests containing Authorization and web refresh credentials are rejected. The browser binding cookie remains validated by the accepted web service.

The dispatcher does not decode credentials into identity or accept caller-selected identity. It constructs both accepted revocation services from the same captured verifier, principal resolver, repository, and clock; the web service also receives the configured origin, binding-cookie, and CSRF authority. It delegates once to the selected branch, forwards the raw request/response and web CSRF value only on the web branch, and has no fallback or retry. A rejected selected service produces a generic error if the response is still writable; it does not trigger another branch.

The accepted services retain direct TLS and their existing web origin/binding/CSRF and mobile bearer/principal checks. The module registers one controller, has no imports of the competing revocation controller modules, is absent from default application wiring, and validates/captures its development-only configuration at registration. The middleware and parser-error handler apply no-store headers and return a generic problem response for malformed requests in the route namespace.

The source tests exercise both branch delegations, mixed and duplicate credentials, no-mutation rejection, no fallback after a selected-service failure, hostile configuration capture, and actual HTTPS integration with bootstrap, refresh, listing, and the unified revocation controller. The integration source also checks default-app 404 behavior. Root QA reports 25 focused tests and 988 full API tests passing, plus API lint, typecheck, and build; these results were reviewed as supplied and were not rerun during this source-only review.

## Frozen source hashes

- `apps/api/src/auth/sessions-v2/v2-session-revocation-http.ts` — `119c22d880e5f15b60d61a998e458caca41284242976d3b6f56cb5ff50bb5fd0`
- `apps/api/src/auth/sessions-v2/v2-session-revocation-http.module.ts` — `14ddb7a400802deed9c16869732e64b268fbbf006275377fb5264ea2252d5cfa`
- `apps/api/src/auth/sessions-v2/v2-session-revocation-http.spec.ts` — `6782019051f739f1e28226b3c1ff5bdc24aa3b5f379fbe6ab350b366e86ad7a8`
- `apps/api/test/v2-session-revocation-http.spec.ts` — `a259919b312fad7f85eb949de4976b27a5f5aab824f852a79a1ec62ae1a14259`

The four SHA256 values were independently computed and match `.sdlc/evidence/ST-197/source-freeze.json`.

Work accounting: 5 tool calls (three source/evidence reads, one independent hash check, one artifact write) and 1 final response, 6 total. No source edits, tests, or Git operations were performed.
