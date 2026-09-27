# Decision Rules, Escalation & Loop-Breaking

## 1. Decision classes
| Class | Definition | Who decides | Record |
|---|---|---|---|
| **Type 1 (one-way door)** | Hard or costly to reverse: product scope, money spent, production or public exposure, data deletion, security model, primary stack change, governance change | **Founder** (via the Conductor on Telegram) | ADR + `.sdlc/decisions.md` |
| **Type 2a (architecture)** | Reversible but cross-cutting: new package, new dependency with >1 consumer, schema change, API contract change, new background job | The relevant **architect**; the Conductor breaks ties | ADR (short form OK) |
| **Type 2b (local)** | Inside one module: naming, internal structure, a private helper, test approach | The **implementing agent** | PR description |
| **Design** | Tokens, signature components, hero screens | **design-lead**; founder at gate G-DESIGN | Storybook + PR |
| **Security veto** | Any finding rated High or Critical | **security-privacy** blocks; the founder can override *in writing* | `docs/ops/SECURITY_FINDINGS.md` |

## 2. Founder approval required (the Conductor asks on Telegram and waits)
| ID | Trigger |
|---|---|
| D-01 | Approving a production/public release (including store/public distribution). Routine task PR merges to `main` after required reviews, QA and CI are not D-01 decisions. A production/public release still requires a distinct founder approval, milestone evidence and security sign-off. |
| D-02 | Any spend: paid API, SMS credits, domain, Apple/Google fees, paid LLM tokens beyond the Codex plan |
| D-03 | Creating an account or a credential on a third-party service in the founder's name |
| D-04 | Submitting to App Store Connect or Google Play (any track beyond internal) |
| D-05 | Exposing a new public port or endpoint on the VPS, or removing basic-auth from staging |
| D-06 | Deleting data outside local or test databases, or force-pushing any shared branch |
| D-07 | Changing PRODUCT_SPEC scope, DESIGN_DIRECTION concept, CONSTITUTION or DECISION_RULES. A governance amendment takes effect only after its governance-labelled PR is approved by the founder and merged. |
| D-08 | Replacing a seed ADR decision (ADR-0001..0008) |
| D-09 | Enabling real SMS, real email to non-founder recipients, or push notifications to non-test devices |
| D-10 | Accepting a security High risk instead of fixing it |
| D-11 | Adding a dependency with a non-permissive licence (GPL/AGPL/SSPL/unknown) |
| D-12 | Anything the Conductor is unsure is Type 1 (when in doubt, ask) |

**Asking format** (the Conductor must use this; keep it phone-readable):
```
❓ DECISION NEEDED [D-0x] <short title>
Context: <2–3 lines>
Options:
  A) <option> — impact/cost
  B) <option> — impact/cost
  C) <option> — impact/cost
Recommendation: <A/B/C> because <1 line>
Blocking: <task ids> · Reply with A, B, C or your own answer.
```
While waiting, the Conductor continues with work that isn't blocked. If the founder hasn't answered within 24 h, send one reminder. **Never proceed on silence** for D-01..D-12.

## 3. Autonomy (no need to ask)
Everything not listed in §2 that stays within the accepted spec and ADRs. That includes:
- creating and closing tasks,
- choosing implementation details,
- adding dev-only dependencies with permissive licences,
- refactoring inside a module,
- writing tests and docs,
- deploying to **staging** behind basic-auth after QA passes,
- running EAS **development/preview** builds.

## 4. Conflict resolution
1. **Spec vs spec:** the PO proposes a resolution; the architect confirms feasibility; the Conductor decides if it's Type 2. Otherwise → founder.
2. **Agent vs agent** (for example a reviewer rejects twice): each side writes a ≤10-line position into the task file. The Conductor decides within one cycle, and the decision is final unless it is Type 1.
3. **Spec is silent:** choose the option that is most privacy-preserving, reversible and simple. Record it as an assumption in the task and in `ASSUMPTIONS.md` (status "Assumed").

## 5. Loop-breaker (MANDATORY)
An agent **must stop and hand back to the Conductor** with status `BLOCKED` when any of these fire:

| Signal | Threshold |
|---|---|
| Same test or build failure after fix attempts | 3 attempts |
| Review rejected for the same reason | 2 times |
| Diff oscillation (re-applying a change it previously reverted) | 1 time |
| No measurable progress (no new passing test, no new file, no narrowed error) | 45 min wall-clock or 25 tool calls |
| Needs information from an external doc it cannot access or verify | Immediately |
| Wants to modify files outside the task's `allowed_paths` | Immediately |

When the loop-breaker fires, the Conductor:
1. Re-dispatches once with a narrower task, a different approach, or an escalation to Sol / the architect.
2. If it is still blocked, **asks the founder** using the format in §2 with the tag `🔁 LOOP`, including what was tried (max 5 bullets) and a recommended way forward.
3. Never runs the same task more than 3 times in total without founder input.

## 6. Model routing
- Sol: conductor, architects, security-privacy. Also any task labelled `complex`, `security`, `money-core`, `policy`, or `architecture-spike`.
- Luna: everything else by default.
- Escalate to Sol after 2 failed Luna attempts (§5), or when the reviewer rates the output "structurally wrong" rather than having "minor issues".
- Model ids are not hard-coded in docs. They are configured in `openclaw.json` (see `SOL_MODEL` / `LUNA_MODEL` at install).

## 7. Budget & concurrency (protects the Codex plan limits and the VPS)
- At most **4 concurrent specialist sessions** (plus the Conductor).
- At most 1 heavy job at a time (E2E suite, Docker build, ML training, Playwright scraping).
- If the provider signals a rate/usage limit, the Conductor pauses dispatching, notifies the founder with an estimated resume time, and resumes automatically.
- Size budgets per task: S ≤ 30 min, M ≤ 2 h, L ≤ 4 h of agent time. Anything bigger must be split before it becomes Ready.
