# Paperclip ↔ OpenClaw ↔ Telegram runbook

## Current state

As of 2026-09-26, Paperclip's connection catalog reports `telegram` as unavailable for this agent, and no `openclaw` catalog service is exposed. Live provisioning and the phone acceptance test must wait for platform connection enablement.

## Target architecture

1. An allowlisted Telegram private chat sends a command to a dedicated bot.
2. OpenClaw authenticates the bot update, enforces the Telegram user and chat allowlists, and converts the request into a constrained Paperclip operation.
3. Read-only requests use Paperclip's agent-scoped API and return a redacted summary.
4. State-changing requests create an explicit confirmation step before execution.
5. Every accepted or rejected command is written to an audit log with actor, chat, command class, target, outcome, and Paperclip run/action identifier. Tokens and sensitive content are never logged.

## Required configuration

- Paperclip platform support enables the Telegram connection for this company/agent and exposes the supported OpenClaw bridge or deployment path.
- Create one Telegram bot through BotFather. Store its token as a managed secret; never place it in an issue, document, repository, or chat message.
- Record the founder's numeric Telegram user ID and the intended private-chat ID as allowlist values. Reject group chats unless explicitly approved later.
- Give the bridge a least-privilege Paperclip agent identity. Start with read access to tasks, milestones, blockers, approvals, and issue-thread interactions.
- Configure webhook verification or Telegram secret-token validation, replay protection, rate limiting, and bounded request timeouts.

## Command policy

Allowed without a second confirmation:

- `status` — concise company/task overview.
- `tasks` — assigned or active task summaries.
- `task <identifier>` — redacted detail for one task.
- `blockers` — active blockers and their owners/actions.
- `approvals` — pending approvals, without credential or sensitive payload fields.

All state changes require an explicit, task-bound confirmation showing the exact action and target. A confirmation must expire, be single-use, and be auditable. Examples include changing task status, posting a comment, resolving a blocker, accepting an interaction, or approving an action. Destructive, financial, hiring, secret-management, and permission changes remain subject to their normal Paperclip governance gates in addition to Telegram confirmation.

## Redaction and authorization

- Deny requests unless both Telegram user ID and chat ID match the allowlist.
- Return a generic denial with no company or task information for unauthorized senders.
- Never emit API keys, bot tokens, secret values, environment variables, customer financial data, payment data, or full sensitive task bodies.
- Prefer identifiers, titles, status, priority, owner, blockers, and short sanitized summaries.
- Apply a denylist for credential-like fields and a final outbound redaction pass.
- Limit message size and paginate summaries to avoid accidental bulk disclosure.

## Notifications

Send concise notifications only for:

- task assignment or material status change;
- milestone completion;
- a newly created or resolved blocker;
- an approval or confirmation that needs the founder's attention.

Each notification should include the task identifier, title, new state, next action, and a Paperclip deep link when supported. Coalesce noisy events and do not include secret or customer-sensitive fields.

## Acceptance test

Run from the founder's allowlisted phone chat:

1. Send `status`; verify a current, redacted Paperclip summary is returned.
2. Trigger a harmless Paperclip task update notification; verify it arrives in the same chat.
3. Query one task; verify status, owner, blockers, and next action are current.
4. Attempt a state change; verify nothing changes until the explicit confirmation is accepted, then verify the audit record.
5. Repeat from a non-allowlisted Telegram account/chat; verify rejection and no metadata leakage.
6. Seed a test task with credential-like and financial fields; verify outbound content is redacted.
7. Revoke/rotate the bot token and verify the documented recovery path.

## Disable and recovery

Emergency disable:

1. Disable the Paperclip Telegram/OpenClaw connection or stop its webhook worker.
2. Revoke the Telegram bot token in BotFather.
3. Revoke the bridge's Paperclip credentials and invalidate pending confirmations.
4. Review audit events for unauthorized access and notify the responsible operator.

Recovery:

1. Rotate the Telegram bot token and Paperclip credential.
2. Reconfirm the numeric user/chat allowlist from a trusted administrative channel.
3. Restore the webhook with verification enabled.
4. Repeat the complete acceptance test before re-enabling notifications or state-changing commands.

## Unblock checklist

- Telegram connection state changes from unavailable to available/ready.
- The supported OpenClaw bridge/deployment mechanism is exposed or documented for this Paperclip company.
- Managed-secret storage is available for the bot token and bridge credential.
- The founder completes Telegram-side bot authorization and supplies allowlist identity through the connection setup flow, not an issue comment.
