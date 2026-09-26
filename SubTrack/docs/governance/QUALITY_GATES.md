# Quality Gates, Definition of Ready and Definition of Done

## Definition of Ready (checked by the PO before READY)
- [ ] The task contract is complete (templates/TASK.md): goal, context links, acceptance criteria (Given/When/Then), allowed_paths, dependencies, size ≤ L, owner role, reviewers.
- [ ] Dependencies are DONE or explicitly mocked behind an interface.
- [ ] UI tasks: the screen/component spec exists (design-lead), with the i18n keys listed.
- [ ] API tasks: the contract change exists in `openapi.yaml` (or is part of this task and reviewed by the architect).
- [ ] No open questions, or the questions are recorded with a chosen default (DECISION_RULES §4.3).

## Definition of Done (checked by QA; the Conductor verifies before merge)
- [ ] Every acceptance criterion is demonstrated, with evidence (test names, screenshots for UI, or curl output for API) in the PR.
- [ ] CI is green:
  - lint, typecheck, unit, integration
  - contract test
  - i18n key parity
  - secret scan
  - licence check
  - bundle-size budget (web)
- [ ] Coverage: overall ≥ 80% on changed files; `packages/money` and `packages/domain/policy` at 100% branches.
- [ ] Required reviews are APPROVE (OPERATING_MODEL §5) and there are no open `blocker` or `major` findings.
- [ ] Security-sensitive PRs: the security-privacy checklist is attached.
- [ ] Docs are updated (spec, ADR, runbook, or README) where behaviour or setup changed.
- [ ] Accessibility: labels, focus order, contrast (axe on web; RN accessibility props on mobile).
- [ ] Both themes and both languages were checked (screenshots for light/dark × sv/en on UI changes).
- [ ] No new TODOs without a task id. No skipped tests without a BUG task.

## Milestone gates
| Gate | Evidence package the Conductor sends to the founder |
|---|---|
| G-M0 | CI screenshot, `docker compose ps` healthy output, ADR list |
| G-DESIGN | 3 hero screens × light/dark × sv/en (12 images), plus a 20-second motion capture of the Orbit |
| G-M1…G-M5 | QA gate report (tests, pass rate, coverage), exit-criteria checklist, a 60–90-second screen recording of the flows, security sign-off |
| G-M6 | TestFlight build number + Play internal link, Maestro run report, device matrix |
| G-M7 / v1.0 | Full PRODUCT_SPEC §8 checklist, security & privacy report, performance report, store listing drafts |

## Test pyramid & tools
- Unit: Vitest (TS), pytest (ML).
- Property-based: fast-check (money, visibility policy, allocation invariants such as "the sum of shares = the total").
- Integration: API + Postgres in Testcontainers (or the compose test profile). Supertest.
- Contract: schemathesis or openapi-fuzzer against a running API. Generated-client type check.
- E2E web: Playwright (with axe). E2E mobile: Maestro flows on the iOS simulator and an Android emulator (run in CI on macOS or EAS workflows when available; locally at minimum).
- Visual regression: Storybook + Playwright screenshots of the signature components.
- Golden money suite: ≥ 60 cases, including 50/50, 70/30, 100/0, fixed + remainder, 3–6 members, dependants excluded, odd-öre rounding, refunds, mid-month price change, member leaving mid-period, multiple payers, and a cancelled subscription.
