# Kickoff Runbook (the Conductor executes this on the first "Start SubTrack")

1. **Pre-flight** (report failures to the founder, and stop only on red items):
   - `git -C $REPO_DIR status` is clean; the remote is `achkum/Applied-AI-Projects`; push access is verified with a dry run on a scratch branch.
   - Node ≥ 22, pnpm, Docker + Compose, Python 3.12 + uv, and gh CLI (optional) are available on the VPS. Report free RAM, disk and CPU.
   - Read HUMAN_TODO.md and list which items are done. Missing items are non-blocking at M0.
2. **Branch setup:** until the ST-031 governance amendment is approved and merged, preserve the existing branch setup. After it takes effect, `main` is the task integration branch; do not create or use `subtrack/develop` for new task PRs.
3. **Seed the board:**
   - Create `.sdlc/backlog.yaml` from `docs/product/BACKLOG_SEED.md`.
   - Create task files for all M0 tasks and the D1 tasks.
4. **Execute M0** tasks in dependency order, with the WIP limits.
5. **Send the first STATUS**, plus a `DECISION NEEDED` for ASSUMPTIONS A11 (model routing) and Q1/Q2 if they are still open.
6. **On G-M0 approval,** start M1 + M2 + D1 in parallel lanes.
