# ST249 independent backend platform source review

SOURCE GO, 2026-10-14. Reviewed actual dirty backend in st/native-synthetic-bank against AGENTS, Constitution, ADR-0016, ST249 task, ST248 local contract freeze, final business guard/privacy plan and literal named SQL/017 proposal. This is source approval only, not PostgreSQL execution, installed native acceptance, production retention or full ST081 completion. No source/Git/push/SQL execution performed by reviewer.

The five contract-first operations and closed flat body parser preserve direct development-only HTTPS/current Bearer framing; no client owner/source/generation selector. Runtime request/response validation checks canonical positive int64 strings and bounded projections. The portable hasOwnProperty.call change preserves descriptor/prototype/accessor rejection. HTTP catches only the authority-owned successful-rollback expiry class for 409; arbitrary guard exceptions/messages remain unavailable.

Checked implementation rather than coverage alone: current identity/session locks and complete persisted Just-me precede receipt replay; detection statement parameter zero is bound to current verified owner; all eighteen statements retain owner predicates and generation/account/currency/status restrictions. Scan validates the entire positive representative candidate set before any candidate insertion, matches raw descriptors only to fixed trusted Synthetic canonical labels, deduplicates via the complete immutable tuple hash and leaves prior review/source links intact. Receipt readback validates response/operation/resource/post-revision. Compare-update delegates revision to the existing trigger and verifies returned status/revision; critical mutation helpers require exact one-row identifier/command/readback agreement.

017 has FORCE owner RLS on all five tables, same-owner candidate/source/generation links, RESTRICT source retention, exact feedback-event inverse FKs and scoped immutable receipt uniqueness. Original feedback inserts before original receipt; inverse receipt inserts before feedback superseding, satisfying the nondeferred FK order. Receipt status/window/response checks exclude invalid operation combinations; the exact closed JSON object equality prevents missing/extra undoUntil shape from relying solely on nullable SQL CHECKs. No candidate UPDATE or new DELETE privilege, bank purge widening, runtime catalogue write or default deployment loader.

Undo locks original receipt/candidate, checks post revision/current result/unconsumed inverse and uses strict trusted now < immutable undo deadline. Optional synchronous finalGuard runs after existing awaited callback and final epoch/session work; source has no await between finalGuard and COMMIT dispatch. Provenance-tagged known expiry escapes only following successful pre-COMMIT ROLLBACK; unknown/failed rollback, async/invalid guard, clock regression and COMMIT uncertainty remain unavailable. Successful historical original/Undo replay installs no newly expiring inverse deadline. Reviewed meaningful microtask-order regression that fails the old await-after-business-guard implementation.

Evidence verified: existing coverage-final.json has authority125/body11/store191 branch arms, zero missed (327 total). Handoff records106 focused API tests and three strict contract tests passed; reviewer did not repeat the unchanged campaign. Scoped git diff --check passed. Real PostgreSQL qualification must still establish SQL syntax/runtime grants/RLS/concurrency/rollback and exact source-linked purge behavior; unit coverage cannot establish those. Native/client/domain dirty files are outside this approval.

Reviewed principal SHA256 values:
- private-mobile-detection.ts: ea5595a3caa030ee13c851199d317d644147829ad7411fe460ccbbaed3ac4d22
- private-mobile-detection-statements.ts: 2561bebe186a91ba45da6bd6444540c9a2a4da0ca5ab484ab89b7922296f364c
- 017-private-mobile-detection.sql: 0c7557ce2740039b63169002842e2da0a91038ad2c54ec27800dd7b44ba50d82
- durable-mobile-authority.ts: 2fcd5b22a39c6309a4d19efbceb1307c612557a185f86cebcb9b02bc5270354b
- private-mobile-detection.ts contract: 4a70a82545fd1767fe56231a0510f65adacf9ed33801572af7be3056143cfcb7

## Final token microtask-gap correction recheck

2026-10-14 final platform SOURCE GO supersedes the earlier authority hash/claim above. Privacy correctly identified that the existing awaited precommit callback still yielded between its token verification and the final business guard. My initial review verified business-deadline placement but missed this token-validity gap.

Reviewed root's narrow source repair: finalGuard now FIRST synchronously verifies the token and compares both sub and sid to the immutable original owner/session. Only then does it invoke the synchronous business guard. No await occurs after this final token verification/business guard before COMMIT dispatch. The legacy awaited callback remains unchanged for existing transaction users. Denial remains provenance-tagged and known pre-COMMIT rollback; no new authorization or error escape.

Reviewed substantive regression: fourth verification schedules a microtask advancing expiry while the old await yields; fifth verification now denies, performs ROLLBACK, never calls business guard and never dispatches COMMIT. Separate final foreign subject/session/rejected-token cases cover owner continuity. Existing equality/deadline/clock regression/spoofed expiry/async guard/unknown commit tests remain. Actual latest coverage JSON verifies129 authority branch arms with zero missed; root reports43 authority tests and lint PASS. Scoped diff --check PASS. No redundant campaign rerun.

Final reviewed durable-mobile-authority.ts SHA256: 435ed04fade28e302d4bdf636896488e50592547aade490a7044022f0a6a6ae3.

Portable contract own-property call was reviewed in the original source review and preserves strict descriptor/prototype validation. PostgreSQL/installed-native and applicable CI acceptance remain outstanding; no approval of other authors' UI/domain files is implied.
