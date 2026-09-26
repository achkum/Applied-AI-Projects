# SubTrack MVP1 execution plan

## Goal

Build the smallest polished, privacy-first Sweden/EU MVP that completes this value loop: connect a Tink Sandbox account → ingest and normalize transactions → detect recurring subscriptions → let users review results → create a household → explicitly share subscriptions → configure splits → calculate settlement.

Provide secure phone-based development tracking through OpenClaw connected to Telegram, without exposing customer financial data, credentials, or privileged operational controls in chat.

## Guardrails

- The app and project name is **SubTrack**.
- Tink Sandbox only for MVP1; verify current documentation and account capabilities before implementation.
- Keep Tink behind a `BankDataProvider` abstraction and build a deterministic `MockBankProvider`.
- Household membership never exposes unrelated transactions; sharing is explicit and auditable.
- Financial arithmetic is deterministic application code, never an LLM.
- Telegram tracking is for development status, milestones, blockers, approvals, and safe summaries—not bank data, transaction details, secrets, access tokens, or production commands.
- OpenClaw must use least-privilege access, an allowlisted Telegram chat/user, auditable actions, and explicit confirmation before any state-changing operation.
- No production banking, payment initiation, Swish, cancellation, native apps, investments, lending, insurance, credit scoring, crypto, or broad budgeting in MVP1.

## Approach

1. Validate architecture, current Tink Sandbox capabilities, security model, and delivery milestones.
2. Define mobile-first user flows and acceptance criteria for individual and household modes.
3. Build the TypeScript/React/Next.js experience, Node.js/TypeScript API, PostgreSQL model, provider abstraction, ingestion, normalization, recurring detection, household sharing, split rules, and settlement.
4. Configure OpenClaw with Telegram for concise phone updates, milestone/blocker notifications, an explicit completion notification after the tested MVP is pushed to GitHub, and approved status queries; validate the exact integration path and credentials at implementation time.
5. Add basic explainable AI insights only after deterministic product logic is working.
6. Verify financial edge cases, privacy boundaries, provider disconnect, export/deletion, Telegram access controls, and the complete MVP journey.

## Proposed lean team

- **CTO — Technical Lead:** Own architecture, stack validation, Tink/provider abstraction, data model, security, deployment, observability, and OpenClaw/Telegram integration design.
- **Product Designer — Product & UX:** Own user stories, acceptance criteria, mobile-first flows, household privacy behavior, and subscription lifecycle UX.
- **Founding Engineer — Full-stack:** Implement the approved architecture and end-to-end MVP experience.
- **QA & Security Engineer — Quality and privacy:** Own automated financial tests, integration/E2E coverage, security testing, privacy testing, Telegram access-control testing, and release readiness.

Orchestrator remains responsible for product direction, sequencing, scope control, and decision escalation.

## Proposed follow-up tasks

1. **Architecture and Tink discovery:** Validate the stack; inspect current Tink Sandbox documentation/account capabilities; define provider contracts, domain boundaries, data model, security controls, and milestones.
2. **Product and UX specification:** Produce prioritized user stories, acceptance criteria, flows, screens, empty/error states, and explicit household privacy behavior.
3. **Engineering foundation:** Establish the application, database, authentication, CI, provider abstraction, deterministic fixtures, and audit/consent foundations.
4. **Core individual experience:** Implement sandbox connection, ingestion, normalization, merchant mapping, recurring detection, review/correction, subscription list/detail, and dashboard.
5. **Household value loop:** Implement households, invitations, explicit sharing, equal/percentage/fixed/custom splits, deterministic settlement, and completion tracking.
6. **AI insights and hardening:** Add explainable non-arithmetic insights, privacy/data controls, observability, security tests, and complete end-to-end verification.
7. **OpenClaw + Telegram development tracking:** Validate the supported deployment/integration path; connect an allowlisted Telegram bot/chat; publish concise milestone, blocker, approval, and task-status updates; support safe read-only status queries; redact secrets and financial data; require explicit confirmation for any state-changing command; document setup, recovery, and disable procedures.

## MVP success test

A user can register, connect a Tink Sandbox institution, see normalized accounts and transactions, review detected recurring payments, create a household, invite a member, explicitly share a subscription, configure a split, calculate and mark a settlement complete, view a basic explainable insight, disconnect the provider, and delete/export their data.

The founder can also receive SubTrack development milestones and blockers in an allowlisted Telegram chat, request a current status summary from their phone, and receive a final completion message containing the verified GitHub branch and commit after the tested MVP is pushed. No sensitive financial data or secrets may be exposed, and no state-changing action may occur without confirmation.

## Source control and delivery

- The completed, tested MVP must be committed and pushed to [achkum/Applied-AI-Projects](https://github.com/achkum/Applied-AI-Projects).
- Use a dedicated SubTrack directory and feature branch unless the repository owner specifies an existing layout or branch policy.
- Do not push unfinished or failing work as the completed delivery; record the final commit and branch on the implementation task.
- GitHub access must be connected and repository write permission verified before release.
- After the completed, tested MVP is pushed, send the founder a Telegram completion message with the repository path, branch, and verified commit; record delivery success or failure on the implementation task.
