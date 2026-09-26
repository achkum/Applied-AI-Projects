# Operating Model — the AI SDLC

## 1. Lifecycle of a work item
```
BACKLOG ─(PO: DoR met)─> READY ─(Conductor dispatch)─> IN_PROGRESS ─(dev: PR open)─> IN_REVIEW
   ▲                                                         │                         │
   │                                                     BLOCKED ◄───── loop-breaker ──┤
   │                                                         │                         ▼
   └──────────── REJECTED (scope) ◄──────────────────── Conductor           IN_QA ─(QA pass)─> DONE
                                                                                   └─(QA fail)─> IN_PROGRESS
```
- **Epic:** a milestone feature (F-ids).
- **Story:** a user-visible slice with acceptance criteria.
- **Task:** one agent, one PR, sized S/M/L.
- IDs: `ST-###` for tasks and stories, `EP-##` for epics, `BUG-###`, `SPIKE-###`.

## 2. The board (file-based, in git, so every agent can read it)
```
SubTrack/.sdlc/
├─ backlog.yaml        # ordered list of epics/stories/tasks with status, owner, deps, size, milestone
├─ tasks/ST-123.md     # the task contract (template: governance/templates/TASK.md)
├─ decisions.md        # log of Type-1/Type-2a decisions (date, id, decision, link)
├─ reports/YYYY-MM-DD.md  # daily status report (also sent to Telegram, shortened)
└─ metrics.json        # throughput, cycle time, reopen rate, escalations (Conductor updates daily)
```
- Only the Conductor edits `backlog.yaml` statuses. Agents update *their* task file's `## Progress` and `## Handoff` sections.

## 3. Cadence
| When | What | Who |
|---|---|---|
| Continuous | Dispatch loop: pick the highest-priority READY task whose deps are DONE, respecting the WIP limits | Conductor |
| Every PR | Review chain (§5) → QA → merge to `subtrack/develop` | Reviewers, QA, Conductor |
| Daily 18:00 Europe/Stockholm | Status report to Telegram (template REPORT.md): done, in progress, blocked, decisions needed, risks, next 24 h | Conductor |
| Per milestone exit | Gate review: QA gate report + security sign-off + demo screenshots/video → founder | Conductor, QA, Sec |
| Weekly (Sunday) | Retro: metrics, top 3 friction points, proposed governance/skill tweaks (as PRs, founder approves) | Conductor |

## 4. Branching & PRs
- Long-lived branches: `main` (release) and `subtrack/develop` (integration).
- Task branch: `st/ST-123-short-slug`, created from `subtrack/develop`.
- Commits follow Conventional Commits with the task id: `feat(api): household invitations [ST-123]`.
- One task = one PR. PRs over 600 changed lines (excluding generated files and lockfiles) must be split, unless the Conductor grants an exception.
- The PR description uses `templates/PR.md` (includes the evidence section).
- Merge strategy: squash into `subtrack/develop`. The Conductor merges only when every required check and approval is green.

## 5. Review chain (required approvals by path)
| Paths touched | Required reviewers |
|---|---|
| `apps/api/**`, `services/worker/**`, `packages/contracts/**`, Prisma | architect-platform |
| `packages/money/**`, `packages/domain/policy/**` | architect-platform **and** security-privacy |
| auth, identity, providers, crypto, RLS, export/delete | security-privacy |
| `apps/web/**`, `apps/mobile/**`, `packages/ui*/**` | architect-client; design-lead for visual changes (screenshots required) |
| `packages/domain/detection/**`, `services/ml/**`, `packages/synthetic/**`, `packages/catalog/**`, `packages/llm-gateway/**` | architect-data (+ security-privacy for llm-gateway) |
| `infra/**`, `.github/**`, `eas.json`, Dockerfiles | devops-release (the author may not self-approve; the Conductor reviews devops PRs) |
| `docs/governance/**` | founder |

Reviews are recorded as a structured comment (templates/REVIEW.md): verdict `APPROVE` / `REQUEST_CHANGES` / `BLOCK` (security only), with findings rated `blocker` / `major` / `minor` / `nit`.

## 6. WIP limits
- 4 specialist sessions concurrently (DECISION_RULES §7).
- At most 1 task IN_PROGRESS per agent.
- At most 6 items IN_REVIEW + IN_QA combined. When exceeded, the Conductor dispatches reviewers and QA before new development.

## 7. Communication rules
- Agents communicate through **artifacts** (the task file, PR, review comment, handoff note), not chat. The Conductor summarises for the founder.
- Telegram is Conductor-only and never contains secrets, tokens, personal data or raw logs. It uses the templates in REPORT.md.
- Questions for the founder are batched: at most 3 open questions at once, except blockers.
