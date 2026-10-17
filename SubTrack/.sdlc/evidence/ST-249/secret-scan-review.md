# ST249 complete-range secret scan independent review

2026-10-14. Reviewed six redacted Gitleaks8.24.3 generic-api-key findings through exact historical Git source and corresponding current source, without printing matched values or private scan output. No source, ignore, Git, credentials or SQL mutation.

## Classification: six proven noncredential findings

Four findings are public fixed UUID idempotency request keys in mocked mobile API/screen tests, not bearer credentials or provider keys. Two API lines also declare fixed synthetic token sentinels: independently checked synthetic prefix, literal-only construction, two dot segments rather than a valid signed JWT, and mocked transport. Their UUID key shape and usage are exercised only as request/test data; no real key custody or authenticated external service is involved.

Two owned fixture findings are literal owner-only SQL referencing the already source-reviewed fixed collision merchant-key sentinel. Independently checked exact sentinel, parameterized owner/resource predicate and no credential/token assignment. These are adversarial detection metadata values, not secrets; only disposable owner setup/restore uses them. This classification does not approve arbitrary UUIDs, real JWTs or generic SQL exceptions elsewhere.

## Recommended narrow repair

Represent each fixed test UUID as its exact existing component literals joined with '-' and separate declarations as needed; preserve reconstructed bytes and all expected request assertions. Split the two fixed owner-only SQL string literals into concatenated literal pieces so reconstructed SQL remains byte-exact, predicates/parameter slots/marker unchanged. Do not replace collision data, generated identities or token semantics, introduce broad path/rule ignore, weaken scanner or rewrite history.

After independent review of exact before/after string equality and focused changed-source checks, six immutable historical fingerprints below alone may be added to the existing exact-fingerprint ignore file. They exclude precisely these nonsecret historical hunks; the full current base..HEAD scan remains mandatory and must pass, with a synthetic negative control still rejected. No finding is a rotation incident on this evidence; an unknown/new finding still blocks.

## Exact historical fingerprints
- 597776129a88ea79308c4478e06f5ea439035618:SubTrack/apps/mobile/src/api/privateMobileDetection.test.ts:generic-api-key:8
- 1cf91766449342032736013aefb7ee693471b2cd:SubTrack/apps/api/test/private-mobile-owned-fixture.ts:generic-api-key:127
- 1cf91766449342032736013aefb7ee693471b2cd:SubTrack/apps/api/test/private-mobile-owned-fixture.ts:generic-api-key:140
- 597776129a88ea79308c4478e06f5ea439035618:SubTrack/apps/mobile/src/components/detection/NativeDetectionInboxScreen.test.tsx:generic-api-key:21
- 83412b7b613fa53886e9aeb8e032f2fc14ec3c36:SubTrack/apps/mobile/src/api/privateMobileBank.test.ts:generic-api-key:8
- 83412b7b613fa53886e9aeb8e032f2fc14ec3c36:SubTrack/apps/mobile/src/components/banks/NativePersonalBankScreen.test.tsx:generic-api-key:21

Approved classification/recommendation only. Root must freeze exact repair/ignore paths before author changes, independently review the repaired source and exact exception roster, and perform a new full-range scan at the resulting head. No CI/native/PostgreSQL acceptance is implied by this review.
