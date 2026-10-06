# ST-170c4 security review

**Decision: APPROVE, with an adapter-boundary constraint.** The corrected source closes the duplicate-hiding issue found in my prior review.

Reviewed against `docs/governance/CONSTITUTION.md`, accepted `docs/architecture/adr/ADR-0010.md`, `.sdlc/tasks/ST-170c4.md`, and the v2 credential rules in `packages/contracts/openapi.yaml`.

## Bound source

- `apps/api/src/auth/transport/credential-selector.ts` SHA-256: `41c2035191d88bec7d4c0304e77ed7a9515357c78a378e6844e4a81d8c549089`
- `apps/api/src/auth/transport/credential-selector.spec.ts` SHA-256: `a5232ffc94379e160d25ab969bfc443f78fa875693983ee3f96261ebe653c441`

## Review findings

The corrected snapshot reads each array's own `length` data descriptor, permits only lengths 0 or 1, and reads only own indexed data descriptors; it does not invoke the array iterator or an occurrence getter (`credential-selector.ts:53-65`). This makes custom iterators unable to conceal duplicate evidence and rejects accessor occurrences without executing them. The added regressions cover these cases for access cookies, refresh cookies, Authorization headers, and a getter spy (`credential-selector.spec.ts:94-114`). The before-fix log shows both regressions failing against the prior implementation; the current QA log records all 9 tests passing.

The remaining transport policy is consistent with the accepted ADR and OpenAPI contract: protected web calls select exactly one access cookie with no recognized refresh cookie or Authorization; protected mobile calls select one Bearer header with no v2 cookies. Web refresh accepts one refresh cookie, zero Authorization headers, and optional zero or one access cookie. Mobile refresh accepts one Refresh header and no recognized cookies. Cross-transport mixes fail closed. The six allowed operation IDs are explicit, unsupported IDs fail generically, and output exposes only transport labels. Credential grammar rejects empty, whitespace/control, comma, semicolon, quote, and backslash values; Authorization requires the exact case-sensitive scheme and single-space separator. All invalid inputs map to a fresh generic error without secret interpolation; the selector retains no state and emits no logs.

The lossless HTTP adapter remains a required trust boundary: it must preserve every recognized credential occurrence and reject malformed wire syntax before constructing observations. As with any JavaScript API accepting objects, a deliberately adversarial `Proxy` can trap reflection and pretend to have a valid one-element array; standard reflection cannot reliably establish that an object is not a Proxy. The selector should therefore receive adapter-created observations within the trusted process boundary, not objects controlled directly by untrusted callers. This limitation does not allow ordinary parser-created arrays, custom iterators, holes, duplicate entries, or indexed accessors to bypass the corrected checks.

## Evidence and limits

`/workspace/.setup/ST170c4-tests.log` records 9 passing tests and 95.16% statement / 94.28% branch coverage. `/workspace/.setup/ST170c4-regression-before.log` records the two new regression failures against the old behavior. Lint log is empty. Typecheck log contains Prisma generation and the TypeScript invocation without an explicit exit summary, so I do not independently attest that gate. I did not run tests during this review.
