# ST249 backend privacy final source review — repair required

Independent security/privacy review, 2026-10-14. SOURCE HOLD for one concrete final-authority race; no SQL execution, code mutation, Git or broad test replay performed. Backend scope only; domain/native/client are separate streams.

## Required repair

`durable-mobile-authority.ts` lines45–47 awaits beforeCommit before finalGuard/COMMIT. `withCurrentMobileAuthority` lines73–81 places last token verification in that awaited callback, while finalGuard only evaluates the optional business outcome. Therefore a microtask can run after last verification and expire current token while the Undo deadline remains valid; COMMIT still dispatches. The existing guard-scheduled microtask regression proves only that the business guard does not itself yield, not that token verification is final and synchronous.

Preserve the generic awaited beforeCommit callback for old transaction callers. For current-mobile transactions, synchronously reverify the token and same owner/sub+sid within finalGuard before evaluating the trusted business guard, with no await before COMMIT. Add a meaningful regression which queues token-expiry advance at the earlier awaited final verification and proves the synchronous recheck denies with known ROLLBACK and no COMMIT. Retain unknown/async/spoof/clock-regression/commit uncertainty masking and opaque expiry only after confirmed successful pre-COMMIT rollback. This is a routine bounded security repair, not a Founder decision or production change.

## Conformant inspected boundaries

Five owner-only FORCE RLS tables, matching dual GUC authority and first-owner parameter guard; current complete-profile/Just-me precedes replay; generation checked before scan receipt replay; eighteen fixed parameterized SQL statements; same-owner source/account/generation INSERT SELECT; immutable source-link RESTRICT with unchanged bank-purge capabilities; exact feedback UUID inverse and single compensation; minimum receipt fields and immutable bounded replay; all candidate positive bigint/int64 bounds checked before first persistent write; trusted fixed canonical merchant labels only; strict flat wire/body and closed privacy projections; no raw labels, credentials, logger, training/export or production/default loader introduced. Existing declaration/source tests do not establish PostgreSQL/native acceptance.

## SHA256 scope inspected

- authority: 2fcd5b22a39c6309a4d19efbceb1307c612557a185f86cebcb9b02bc5270354b
- detection store: ea5595a3caa030ee13c851199d317d644147829ad7411fe460ccbbaed3ac4d22
- named SQL: 2561bebe186a91ba45da6bd6444540c9a2a4da0ca5ab484ab89b7922296f364c
- disposable017: 0c7557ce2740039b63169002842e2da0a91038ad2c54ec27800dd7b44ba50d82
- detection body: b3c85e2003a25cddb410db80aa791f60924b5f318b10805750db28bcfeaa696e
- portable strict contract: 4a70a82545fd1767fe56231a0510f65adacf9ed33801572af7be3056143cfcb7
- private HTTP: 11d46806e75dc2fec18158e4c9b095c6cc0fb6f9a7af9b5621dc1b305a9ffb33
- server registry: 555484c82fde49fd36f54352ce390f836ef35a29d2286810b7a3c626f4858175

Recheck only repaired authority and meaningful regression plus input-dependent checks. Source GO still precedes separately reviewed fixture custody and actual qualification; no release/erasure/fullST081 claim.

## Final delta recheck — SOURCE GO

The prior HOLD above is resolved by the actual repaired source. The transaction's awaited legacy callback is retained; withCurrentMobileAuthority now FIRST synchronously verifies the access token and exact immutable owner sub/session sid inside finalGuard, then evaluates the trusted business deadline. There is no await from that synchronous verification/business guard to commitAttempted and COMMIT dispatch. The focused regression schedules clock/token expiry in the earlier fourth verification callback; the final fifth verification denies, never calls the business guard, rolls back and never commits. Separate final foreign-sub, foreign-sid and token-rejection cases verify immutable identity agreement. Existing unknown/async/spoof/clock-regression, successful replay, expiry equality, failed rollback and commit-uncertainty masking remain intact.

Hash-bound repaired authority SHA256: 435ed04fade28e302d4bdf636896488e50592547aade490a7044022f0a6a6ae3.
Meaningful authority regression spec SHA256: 09cd101336a71b6b4e717f181a81eb44e5f7bee1c3838f4bed360a58e93035a8.
Portable strict contract remains SHA256: 4a70a82545fd1767fe56231a0510f65adacf9ed33801572af7be3056143cfcb7; hasOwnProperty.call is semantically equivalent for own-key validation and does not execute hostile accessors.

Independent privacy SOURCE GO for the reviewed backend roster and above delta only. Other recorded source hashes remain the reviewed boundaries. Root reports focused43 authority tests/129 branches100% plus lint and portable contract3 tests/coverage100% PASS; those were not broadly repeated by this reviewer. No new SQL/native/production acceptance is implied. Fixture custody, actual ordinary-role PostgreSQL and installed Android/iOS acceptance remain mandatory independent gates.
