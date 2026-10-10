# BUG-008b fixture readiness checkpoint (2026-10-10)
Original attempt 1; elapsed time approximately 155 minutes; historical counters retained. CI 38065126296 SQL setup failed once; CI 38065313154 passed unchanged; plausible startup timing only, no causal attribution.
Full-chain CI 38065313127 passed at b5da641 before these setup changes; final-head rerun remains pending.
Both owned fixture scripts probe TCP loopback inside their exact container; historical fixture and runtime-role psql setup use SQLSTATE verbosity and emit only whitelisted ERROR codes or unavailable.
Clean-proof Prisma P####/SQLSTATE diagnostic extraction is preserved alongside the SQLSTATE setup code filter; archived SQL hashes, extraction and assertions remain unchanged.
No local PostgreSQL proof is claimed; LF SHA-256 tools/auth/session-owner-rls-proof.sh: 96c0b081abc68341d60fee5528dcabe30cc5d1a1e759273c9d176edb1edc2deb
LF SHA-256 tools/database/clean-migration-proof.sh: 22660de596314572cb22856d2551fc572e1862f50b2ca75fa31e1b29d8d6060f
Static review and git diff --check pass; scripts not executed; root owns commit, CI execution, and handoff.