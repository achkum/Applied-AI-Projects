# ST-236 SQL source checkpoint — 2026-10-11 09:56Z
1. SQL010 and Prisma mapping drafted on the assigned path; 12 frozen public signatures are present plus executor-only `enrollment_checked_ms`.
2. SQL010 adds reviewed public executor USAGE and SELECT(id,external_id,deleted_at), owner-dual-GUC identity SELECT RLS, and runtime owner FORCE RLS profile.
3. Reservation uses existing global `reservation.key_h` with fixed enrollment operation allowlist; source SQL001–009 untouched.
4. OTP wrong attempts 1–4 commit an increment and retain the same nonce for a new burn; fifth commits attempt 5 and consumes nonce.
5. Original OTP source expiry copies through proof/pending/verified and is checked after waits at each transition.
6. Terminal bind compares stored verified subject, live owned identity, dual GUCs and current-transaction `xmin`; runtime locks identity first.
7. SQL source is **not validated or complete for acceptance**; actual PG16 install/behavior and catalog proof are pending from proof lane.
8. Specific PG risk: executor column grant may not permit `xmin` system-column read; proof author is checking. If denied, narrow authorized alternative is needed before source completion.
9. Call-budget checkpoint: pausing SQL edits pending PG feedback; no fixture issuance, role membership, public write grant or SQL001–009 edit made.
