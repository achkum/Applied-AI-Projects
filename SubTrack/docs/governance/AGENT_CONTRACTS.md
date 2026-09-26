# Agent-to-Agent Contracts

Every interaction between agents follows one of these contracts.
Anything else, such as free-form chat asking for work, is rejected by the receiver with `CONTRACT_VIOLATION`.

## C1 — Dispatch (Conductor → specialist)
Sent as the spawn/task message. It must be self-contained, because specialists may not load SOUL/IDENTITY in spawned sessions.
```yaml
contract: DISPATCH/v1
task_id: ST-123
role: dev-backend
model_tier: luna            # luna | sol
attempt: 1                  # increments on re-dispatch
repo: $REPO_DIR
branch: st/ST-123-household-invitations   # create from subtrack/develop
task_file: SubTrack/.sdlc/tasks/ST-123.md  # READ FIRST — goal, AC, allowed_paths
must_read:
  - SubTrack/docs/governance/CONSTITUTION.md
  - SubTrack/docs/product/USER_FLOWS.md#uf-03
skills: [sdlc-core, backend-nestjs, money-and-splits]
time_budget_min: 120
return: HANDOFF/v1
```

## C2 — Handoff (specialist → Conductor), written into the task file and returned as the final message
```yaml
contract: HANDOFF/v1
task_id: ST-123
status: DONE | BLOCKED | PARTIAL
summary: <≤5 lines, what changed and why>
pr: <url or branch name>
evidence:
  tests: ["api/household/invitations.spec.ts: 14 passed"]
  screenshots: []           # paths under SubTrack/.sdlc/evidence/ST-123/
  commands: ["pnpm --filter api test -- invitations"]
acceptance_criteria:
  - id: AC1
    met: true
    proof: "invitations.spec.ts › declines are idempotent"
assumptions_made: []        # also appended to ASSUMPTIONS.md if cross-cutting
follow_ups: []              # proposed new tasks (Conductor decides)
blocked_reason: null        # required if BLOCKED: what was tried (≤5 bullets), what is needed
touched_paths: [apps/api/src/household/**]
```

## C3 — Review request / result
- The request is the PR, plus a mention in the task file `## Review` section.
- The result uses `templates/REVIEW.md`:
```yaml
contract: REVIEW/v1
task_id: ST-123
reviewer: architect-platform
verdict: APPROVE | REQUEST_CHANGES | BLOCK
findings:
  - severity: blocker|major|minor|nit
    file: apps/api/src/household/invitations.service.ts:88
    issue: "Token compared with === (timing attack)"
    fix: "Use crypto.timingSafeEqual on hashes"
```

## C4 — QA verdict
```yaml
contract: QA/v1
task_id: ST-123
verdict: PASS | FAIL
checked_dod: true
test_runs: [...]
defects: [BUG-045]          # each filed as a task file
```

## C5 — Architecture decision (architect → all)
An ADR PR using `templates/ADR.md`. Once merged, it is binding. The Conductor broadcasts a one-line summary in the next status report.

## C6 — Question (any agent → Conductor)
```yaml
contract: QUESTION/v1
task_id: ST-123
question: "Tink sandbox returns no merchant name for card txns; derive from description?"
options: [A: ..., B: ...]
default_if_no_answer: A     # agents may proceed on the default ONLY for Type-2 decisions
decision_class: TYPE_2A
```

## C7 — Founder message (Conductor → Telegram)
Only these templates are allowed: `STATUS`, `DECISION NEEDED`, `LOOP`, `GATE`, `INCIDENT`, `DONE`. See REPORT.md.
