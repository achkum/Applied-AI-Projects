# ST-210 security source review

```yaml
contract: REVIEW/v1
task_id: ST-210
reviewer: security-privacy
verdict: REQUEST_CHANGES
scope: Exact source review only; no test, network, database, CI, or QA run by reviewer.
findings:
  - severity: major
    file: apps/api/src/auth/otp-v2/mobile-enrollment-otp-http.ts:238
    issue: >-
      Both controllers receive only Nest/Express parsed @Body. Duplicate JSON members
      have already collapsed before exact() inspects the object. A start or verify
      payload with a duplicate channel, identifier, challengeId, code, purpose, or
      transport can be accepted according to the last value. This violates the
      required duplicate/ambiguous wire rejection and causes the request digest to
      describe the reconstructed object instead of the literal wire payload.
    fix: >-
      Reject duplicate JSON members at the raw-body parsing boundary before any
      rate, reservation, or producer operation; add real TLS tests for duplicate
      start and verify members, including conflicting values.
  - severity: major
    file: apps/api/test/mobile-enrollment-otp-http.spec.ts:89
    issue: >-
      The real TLS suite covers success, selected malformed/header cases, replay,
      and route absence, but lacks the required wrong-attempt sequence, concurrency,
      expiry/clock/rate/capacity cases, reserve/slot/producer/settle/publish/cleanup/
      response faults, and restricted-proof rejection. Some are covered only at the
      service-unit layer. The acceptance criterion specifically requires actual
      HTTPS evidence for these transitions.
    fix: >-
      Exercise these transitions through the HTTPS listener and assert status,
      no-store/problem envelope, key burns, and absence of secret disclosure.
  - severity: major
    file: apps/api/src/auth/otp-v2/mobile-enrollment-otp-http.module.ts:23
    issue: >-
      Explicitly registered disabled and production modules expose no controller,
      so their requests receive Nest's default 404 JSON body. The required
      disabled/error path is a generic application/problem+json 404 with
      Cache-Control: no-store and Pragma: no-cache. The TLS suite asserts only
      the status. This finding does not apply to an absent default application
      graph, where the route is never registered.
    fix: >-
      Provide the generic problem response and headers for explicitly registered
      disabled/production modules, and assert the exact envelope and headers
      through the HTTPS listener.
  - severity: minor
    file: apps/api/src/auth/otp-v2/mobile-enrollment-otp-http.module.ts:32
    issue: >-
      The rate limiter retains config.rateKey by reference, so later mutation of
      that supplied byte array changes rate bucket digests and can undo the
      registration-time byte-distinctness check. The anonymous binding, OTP, and
      idempotency keys are copied by their owners.
    fix: Copy the rate key before constructing OtpRateLimiter.
```

Review observations: Development opt-in registration, direct TLS socket check,
header allowlist, framed anonymous HMAC domains, global idempotency reservation,
bounded challenge publication, wrong-attempt restoration only after completed
settlement, terminal cleanup, and restricted enrollment proof linkage are present
in the reviewed implementation.

SHA-256 of the four reviewed files, in order:

| File | SHA-256 |
| --- | --- |
| `apps/api/src/auth/otp-v2/mobile-enrollment-otp-http.ts` | `E908730CF01DADF32054F0D90BD20C07748B04341499A05ECCB933EC4438945F` |
| `apps/api/src/auth/otp-v2/mobile-enrollment-otp-http.module.ts` | `870671E2E8C722DB1296420B0F0C023C8E694C6AC33A1FED2B5B70503EAD3EBD` |
| `apps/api/src/auth/otp-v2/mobile-enrollment-otp-http.spec.ts` | `13247277ACC5F2173361F44C1411D8CF230F01878F9ECEADD110C3EF851686BE` |
| `apps/api/test/mobile-enrollment-otp-http.spec.ts` | `81A789FD624767EBE2E59C694CD103AC4FE853D6237E1A538BF4D7DEC1D6B90A` |

Source approval alone would not establish actual TLS, QA, coverage, or exact-head CI evidence. Any change to these hashes requires a fresh source review.
