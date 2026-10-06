# ST-175 final security/privacy review

**Verdict: APPROVE** for the scoped transport/configuration prerequisite at reviewed source hashes below. The two prior findings are fixed: binding-cookie parsing removes only leading separator whitespace and validates the unmodified value, with a real HTTP regression for trailing whitespace before another cookie; loopback-HTTP enablement is rejected outside development even when v2 is disabled. Cookie paths now reject controls, semicolon, query, and fragment delimiters, with regression cases for `;`, `?`, and `#`. The extractor explicitly rejects non-HTTP(S) Origin protocols even if a caller misconfigures an allowlist.

Raw Origin multiplicity/canonical allowlisting, direct-socket TLS, explicit loopback development HTTP, namespace no-store behavior, and the source-only evidence boundary remain acceptable. No identity/session, nonce issuance, anonymous bootstrap idempotency, or throttle behavior is claimed by this approval.

## ST-176 advisory

For the next route scope, validate a supplied previous binding cookie against the nonce core's accepted opaque-secret format and return a generic failure for invalid input. Reserve idempotency before secret issuance, settle the reservation before sending the response, and never replay minted nonce/cookie values on duplicate or settlement failure. These guards are reflected in the next-scope plan; the route itself is outside this ST-175 review.

## Validation evidence

Validation logs supplied at `/workspace/.setup/ST175-final-*` report 31 focused tests passing, lint and typecheck commands completing, and 316 API tests passing. The full suite count in its log is 316, despite an earlier summary of 313. I did not rerun these checks. The full-suite log includes simulated OTP values and test identifiers; keep those outputs out of retained review artifacts and consider suppressing fixture delivery logs in tests.

## Reviewed source SHA-256

Mechanically computed from the reviewed working tree:

- `apps/api/src/config.ts` — `ab445d5ea138812eedae66ca89b893e84e48982ef548bc2fb0fff4b58d60feb0`
- `apps/api/src/main.ts` — `3c8ee4675815d2f44a353826a1d49c9f2c21990cbc7c96c5f52af7490d42b9a8`
- `apps/api/src/auth/http/v2-browser-context.ts` — `39ba77f29cda731da458c23a8e424bda20f257493226bc68a2b09e7de3cbc813`
- `apps/api/src/config.spec.ts` — `9e8a0eaa2f7ffb120e0753d6c387fc2cd2f877d554cafc8debdfc593a71cce7d`
- `apps/api/src/auth/http/v2-browser-context.spec.ts` — `145e1782e26c5fc182684e94cda39bf3638923ca0dd9b2c5dbc16e280332149d`
- `apps/api/test/v2-browser-context.spec.ts` — `ac1653b39ffe24f8552a21d6352a280727840baed7f414f867d7de06b55dc907`
