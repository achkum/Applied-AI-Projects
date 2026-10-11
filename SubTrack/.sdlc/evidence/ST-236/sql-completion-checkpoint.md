# ST-236 SQL completion checkpoint — 2026-10-11

Owner: SQL010 and Prisma mapping only. Original L240 clock remains 2026-10-11T09:44:30.897Z; this is a specialist rotation after the original 20-call stop, not a new attempt. No SQL/schema edit was made in this rotation, and no PG16 or CI acceptance is claimed.

## Source audit

- SQL010 retains the approved executor `SELECT(id,external_id,deleted_at)` grant, dual-GUC identity SELECT policy, runtime owner profile RLS, global reservation key, fixed operation/purpose checks, original OTP expiry propagation, fifth-attempt durable exhaustion, and separate terminal consume/settle. SQL001–009 remain untouched.
- `bind_enrollment_identity` selects `i.xmin` despite the executor's three-column grant. PostgreSQL 16 documents `xmin` as a system column and requires SELECT privilege for each selected column. PG16 `REL_16_STABLE` executor source checks every referenced attribute number via `pg_attribute_aclcheck`, and its ACL implementation returns no column privilege when `attacl` is null. Therefore the current bind is expected to fail under the approved grant; the actual qualified PG16 proof must confirm the exact error. Do not widen the identity table grant or remove same-transaction new-identity validation.
- Proposed safe alternative for independent Type 2a review: SQL010-only executor-owned private birth attestation table, FORCE RLS, no direct login/runtime/producer rights, populated by a fixed SECURITY DEFINER `AFTER INSERT` trigger on `public.identity`; record only inserted UUID and current xid8. Bind matches exact ID and current xid8 after its existing owned burn/nonce/subject/dual-GUC checks. This keeps the current public identity column grant. A caller-writable/default public `created_xid` column would be spoofable under existing runtime UPDATE and is unsuitable.
- Root found a separate terminal binding mismatch: SQL010 stores bootstrap-domain cookie digest as `session.binding_h`, while accepted ST-235 current-session authority requires `hashBrowserBindingCookie`'s session-domain digest over decoded cookie bytes. Root is seeking independent classification for an immutable issuance-time `session_binding_h` copied through the enrollment chain and used only for session insertion. No unreviewed session digest rewrite was made.
- Reviewed composite null checks, parameter qualification, expiry checks, reservation uniqueness, wrong-code fifth commit, record caps, RLS/profile grants and terminal role sequence at source level. No additional signature defect was established. The apparent start-OTP expiry difference is legitimate: a valid consumed bootstrap nonce mints a fresh bounded OTP source, which is then copied without extension.

## Outstanding before SQL freeze

1. Obtain actual PG16 result for system-column SELECT under the exact executor grant and independent security classification for replacement birth attestation.
2. Obtain Type 2a classification for the immutable session binding digest, then coordinate the one added producer issue argument with the service and proof owners.
3. Apply reviewed SQL010 changes, rerun source audit, and hand exact predicates/signatures to the qualified PG16 proof owner. No Windows Docker claim.

Primary PostgreSQL references: https://www.postgresql.org/docs/16/ddl-system-columns.html ; https://www.postgresql.org/docs/16/sql-select.html ; https://raw.githubusercontent.com/postgres/postgres/REL_16_STABLE/src/backend/executor/execMain.c ; https://raw.githubusercontent.com/postgres/postgres/REL_16_STABLE/src/backend/catalog/aclchk.c .
