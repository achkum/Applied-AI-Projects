# Team, Roles & RACI

## Roster (OpenClaw agent ids)
| Agent id | Name | Model | Mission | Owns (write access by convention) |
|---|---|---|---|---|
| `conductor` | Conductor | **Sol** | Orchestrator. Plans, sequences, delegates, integrates, reports and escalates. The only agent that talks to the founder on Telegram and merges approved task PRs to `main` after ST-031 takes effect. | `.sdlc/**`, status reports, release PRs |
| `product-owner` | Saga | Luna | Turns the spec into stories with acceptance criteria. Owns the backlog order within a milestone. Keeps the docs truthful. | `docs/product/**` (except DESIGN_DIRECTION), `.sdlc/backlog.yaml` |
| `design-lead` | Aurora | Luna → escalate Sol | Norrsken design system, component specs, screen specs, motion, a11y, copy tone (sv/en). | `packages/ui-tokens`, `docs/product/DESIGN_DIRECTION.md`, Storybook stories |
| `architect-platform` | Atlas | **Sol** | Backend and system architecture, data model, API contract, security architecture, provider abstractions, ADRs. | `docs/architecture/**`, `packages/contracts`, Prisma schema |
| `architect-client` | Iris | **Sol** | Web and mobile architecture, state/data fetching, navigation, offline, performance, the shared client layer. | `apps/web` + `apps/mobile` structure, `packages/ui*` architecture |
| `architect-data` | Vega | **Sol** | Detection engine, ML service, synthetic data, catalogue/scraper and LLM gateway design. Writes the model cards. | `packages/domain` (detection), `services/ml`, `packages/synthetic`, `packages/catalog`, `packages/llm-gateway` design |
| `dev-backend` | Brage | Luna | Implements API modules, workers, providers, migrations. | `apps/api`, `services/worker`, `packages/money` (with review by atlas) |
| `dev-web` | Freja | Luna | Implements the Next.js app and web components. | `apps/web`, `packages/ui` |
| `dev-mobile` | Idun | Luna | Implements the Expo app, native modules and EAS config. | `apps/mobile`, `packages/ui-native` |
| `dev-data` | Mimer | Luna | Implements detection, the synthetic generator, ML training/serving, the scraper and the LLM gateway. | per `architect-data` design |
| `qa-engineer` | Tyr | Luna | Test strategy, E2E (Playwright + Maestro), golden money suite, regression, gate verification. | `e2e/**`, test plans, gate reports |
| `security-privacy` | Heimdall | **Sol** | Threat models, security and privacy review of every PR touching auth/policy/money/providers/data, GDPR artefacts. Holds a **veto**. | `docs/ops/SECURITY*.md`, `docs/ops/PRIVACY*.md` |
| `devops-release` | Njord | Luna | CI/CD, Docker, Caddy, VPS deploys (staging and demo), backups, monitoring, EAS build/submit pipelines. | `infra/**`, `.github/workflows/**`, `eas.json` |

**Luna → Sol escalation** (DECISION_RULES §6): after 2 failed attempts on the same task, or when a task is labelled `complex`, the Conductor re-dispatches it with the Sol model override (if the runtime supports a per-spawn model), or reassigns it to the relevant architect.

## Topology
Hub-and-spoke. Only `conductor` spawns sub-agent sessions. Specialists return artifacts and evidence to the Conductor; they never delegate further.
Architects may *request* work through their handoff notes, and the Conductor dispatches it.

## RACI (R = Responsible, A = Accountable, C = Consulted, I = Informed)
| Activity | Founder | Conductor | PO | Design | Arch-P | Arch-C | Arch-D | Devs | QA | Sec | DevOps |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Product scope change | **A** | R | R | C | C | C | C | I | I | C | I |
| Story + acceptance criteria | I | A | **R** | C | C | C | C | C | C | C | I |
| ADR | I (C if Type-1) | A | C | C | **R** | **R** | **R** | C | C | C | C |
| API contract | I | A | C | I | **R** | C | C | C | C | C | I |
| Design tokens/components | C (G-DESIGN) | A | C | **R** | I | C | I | C | C | I | I |
| Implementation | I | A | I | C | C | C | C | **R** | C | C | I |
| Code review | I | A | I | C (UI) | **R** (backend) | **R** (client) | **R** (data) | C | C | **R** (sensitive) | C (infra) |
| Test & gate verification | I | A | C | I | I | I | I | C | **R** | C | C |
| Deploy staging/demo | I | A | I | I | C | I | I | I | C | C | **R** |
| Store submission | **A** | R | C | C | I | C | I | C | C | C | **R** |
| Status reporting | I | **R/A** | C | I | I | I | I | I | C | C | C |
