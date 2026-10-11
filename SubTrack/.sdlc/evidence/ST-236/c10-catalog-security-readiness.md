# C10 atomic catalog acceptance — independent security readiness

**Verdict: conditional Type 2a GO for a narrow proof correction; actual acceptance remains BLOCKED.** This is a read-only architecture/security classification at PR 281 frozen C9 head `462b20e32bb5cf3857b11111398c815d7afe8335`. It authorizes no source edit by this reviewer and is not a C10 source review, actual PG16 pass, QA pass, or merge approval.

The actual foundation receipt from run `38138347866`, job `114466798157`, failed at `atomic-issue-03 / guard-catalog / parent-fence`. The guarded installer returned the required SQLSTATE `22012` and exit `3`; its rollback-absence assertion passed. The original whole-catalog hash differed, while the diagnostic projection matched (`drift=physical-only`). All nine `atomic-issue-02` fault cases advanced. The Linux negative suite passed, 34/34 foundation pins were verified, and cleanup was `removed`. This evidence proves equality of the *defined projection* in that one failed case; it does not identify the changed `pg_class` field or its cause. The foundation job emitted no PASS marker. The separate enrollment job also failed at `first-account`, so ST-236 remains blocked independently of this catalog issue.

## Exact acceptance predicate

Keep `snapshot_gn_catalog` as one database statement returning both the existing whole hash and the projection hash. Its projection may omit **only** `pg_class.relpages`, `reltuples`, `relallvisible`, `relfrozenxid`, and `relminmxid` for `subtrack_auth` relations. It must retain the complete other `pg_class` fields and every existing catalog component: functions, namespaces, constraints, roles, memberships, default privileges, attributes, types, policies, ACL-bearing rows, and RLS-bearing rows. Do not change SQL001–010, grants, policies, feature logic, clocks, custody, or source pins.

For each of the nine `atomic-issue-02` and six `atomic-issue-03` guarded installer cases, require **all** of the following before moving to the next case:

1. The installer failed with the existing expected SQLSTATE `22012` (and its existing process-status checks); a successful installer or different error is fatal.
2. The existing rollback-absence predicate passed; any installed function or forbidden graph residue is fatal.
3. Both baseline and post-attempt catalog snapshots parsed exactly once into valid whole and projection hashes from their respective single-statement queries. Missing, malformed, duplicate, or unavailable output is fatal.
4. The post-attempt projection hash equals the baseline projection hash. A changed projection is fatal, including when the whole hash also changed. If the whole hash differs while the projection matches, accept this catalog assertion **only in these two atomic guard phases** and record the existing bounded `physical-only` drift class. If both hashes match, proceed normally. A whole-match/projection-mismatch inconsistency is fatal.

Equivalently, after the independent guard and rollback checks, acceptance is `valid(before) && valid(after) && logical_after == logical_before`; a whole mismatch is allowed only because the logical projection is exactly equal. Keep computing the whole hash for diagnosis and audit. All other catalog assertions in the foundation proof retain their original whole-catalog equality; no broad replacement of that guard is authorized. Never emit either hash, catalog JSON, row values, SQL, private identifiers, or raw client errors in the receipt.

This is a narrow equality guarantee for the captured logical catalog projection. It does not prove that the rollback caused any physical counter change, that a particular field changed, or that concurrent maintenance is the cause. MD5 remains the pre-existing comparison mechanism; this scope does not propose a new cryptographic claim.

## Fail-closed proof before source approval

- Add focused negative cases for absent, malformed, and duplicate snapshot output, logical mismatch with whole mismatch, and logical mismatch with apparent whole match. Each must stop before the next fault and produce only an allowlisted failure class.
- Demonstrate that a controlled change to a retained `pg_class` field and to another retained catalog component (for example function definition/ACL or role membership) yields a logical mismatch and fails. Confirm the existing rollback-absence check still fails on residue even when the projection matches. The five excluded fields alone may exercise the physical-only continuation branch.
- Confirm the nine and six original fault labels all still require failed installation, exact `22012`, rollback absence, and the bounded catalog predicate. The original non-atomic whole-catalog checks must still reject any whole mismatch.
- Preserve and run the real Linux receipt privacy negatives, exact-head 34-pin custody and cleanup, both full owned PG16 jobs, independent source reviews and actual QA, and all applicable CI. The separate `first-account` failure needs its own diagnosis and passing actual proof; this proposal does not waive it.

The C7 task text explicitly made the projection diagnostic only and required a later independent scope decision if actual evidence showed physical-only drift. This note is that proposed independent narrow decision, subject to Conductor scope authorization and a fresh frozen-source review. Until the changed proof and all required actual gates pass, the C9 FAILED/HOLD verdict stands. Preserve original ST-236 start `2026-10-11T09:44:30.897Z`, L240 attempt 1/source attempt 1, deadline `13:44:30.897Z`, and author/full-PR caps 4700/5000.
