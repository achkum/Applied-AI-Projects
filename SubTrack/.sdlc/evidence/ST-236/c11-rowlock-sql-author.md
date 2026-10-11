# C11 SQL010 row-lock ACL author receipt

Base: PR 281 `7955f192d245d5d079742a9706fa62a9ec7b6634`. This source edit is the narrow C11 Type 2a correction accepted in `c11-rowlock-security-readiness.md` and `c11-rowlock-platform-readiness.md`.

SQL010 adds only `UPDATE(proof_h)` on `restricted_proof` and `UPDATE(pending_h)` on `pending_enrollment` for NOLOGIN `subtrack_auth_executor`. It adds one executor-only `FOR UPDATE` policy per table with `USING (true) WITH CHECK (false)`. The column privileges supply the PostgreSQL `SELECT FOR UPDATE` privilege token in `admit_enrollment` and `verify_enrollment_person`; the policies allow existing bound rows to be locked while denying a resulting row update, including a same-value update. Existing SELECT policies and FORCE RLS remain in place.

Source review: `git diff --check` passed; the SQL diff contains exactly the four statements and one explanatory comment. No table-wide UPDATE, public/caller grant, role membership, ownership, function body, immutable trigger, lock order, source expiry, or SQL001–009 change was made. The SQL010 `FOR UPDATE` sites outside these two tables and their existing grants/policies were left unchanged.

This is source evidence only. No PostgreSQL parser or actual PG16 execution was run by this author. Actual acceptance still requires exact catalog/role/RLS assertions, existing-row positive locks, direct key and same-value UPDATE denial with `42501` and unchanged rows, other-column and caller-role denials, and both blocking owned PG16 jobs with full service proof. The observed C10 `first-account / first-admit / admit / 42501` supports this diagnosis but does not prove the corrected path passes.

Original ST-236 clock and limits remain: `2026-10-11T09:44:30.897Z` start, L240 attempt 1/source attempt 1, `13:44:30.897Z` deadline, author 4700/full PR 5000 caps. No commit or push was made by this author.
