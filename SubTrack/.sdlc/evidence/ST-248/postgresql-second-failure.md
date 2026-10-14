# ST248 changed PostgreSQL run — concrete boolean wire failure

Reviewed source3d069d9eef9f4d9371c18798923df71c5da512ea, actual workflow38488546994/job115608009358.

Closed actual diagnostic: `ST248_BANK_PROOF_FAILURE phase=TWO_OWNER step=B_TO_A_RETAIN category=ASSERTION`.
Cleanup: `ST244_FIXTURE_CLEANUP removed`.

The legitimate Bob setup/profile/Just-me gate, foreign sync denial, and both-owner/manual preservation snapshots passed before the retain request. Failure is not prerequisite/type/build/SQL setup. Exact source cause: private mobile HTTP uses shared enrollment privateBody for all JSON; that tokenizer admits only strings/null. Bank disconnect's reviewed purge:false/true boolean is rejected as wire before ownership logic. The strict reviewed boolean contract itself is unchanged. A new bank-only parser selected only for exact BANK_PATHS is the minimal correction; shared parser, SQL/auth/grants/authority/assertions remain.

Repair plan and privacy PLAN GO precede implementation; source/focused checks and final independent source review are pending. Do not report full owner isolation or PostgreSQL/native completion until the changed actual journey and cleanup succeed. No unchanged rerun performed.
