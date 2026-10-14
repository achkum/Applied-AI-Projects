# ST081 final Undo authority guard plan review

PLAN GO for a synchronous trusted business guard after mandatory token verification and the final awaited epoch fence, immediately before commitAttempted/COMMIT. Current withCurrentMobileAuthority performs awaited session/epoch work after its action; therefore action-side deadline validation is insufficient. No implementation or runtime execution approved by this note.

Freeze the guard port before source: no Promise/async guard, no new await after it, immutable locked original deadline/owner/target context only, fresh trusted authority.now(), strict now < undoUntil (equality expired). Preserve existing token/session/owner/epoch checks and all callers without the optional guard. Apply the deadline to a new inverse, not historical successful Undo replay. Reject malformed/async/clock-regression inputs fail closed.

The current transaction catch masks non-authority exceptions500. A final expired-Undo outcome may map409 UNDO_EXPIRED only through a narrow trusted typed/opaque business-abort outcome after known successful ROLLBACK. Arbitrary exception strings/classes must not escape; failed rollback, uncertain commit, unexpected guard error or storage fault remain generic500. Tests must advance clock across awaited writes/fence and assert full rollback, equality rejection, replay semantics and unchanged existing callers.

Display boundary: normalizeMerchantDescriptor only normalizes Unicode/whitespace/case, and is not a privacy sanitizer or canonical display-label source. custom_name may contain only unambiguous matchMerchantDescriptor canonicalName from trusted catalogue or fixed server-owned Synthetic matching roster. Unknown/ambiguous descriptor groups reject; no raw or normalized descriptor persisted/displayed and no runtime catalogue grant/write.

Existing subscription revision trigger owns INSERT/UPDATE revision changes; compare-update must not assign revision and must use returned revision. Actual DDL, SQL, guard/error wiring and separate source/PG/native reviews remain required. Disposable test lifetime is not production retention or UF11 erasure proof. No source edits/Git/heavy tests performed.
