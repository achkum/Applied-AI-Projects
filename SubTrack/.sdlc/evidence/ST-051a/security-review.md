# ST051a security review

Reviewed the frozen source in `packages/contracts/identifiers.ts`, `apps/mobile/src/components/onboarding/IdentifierEntry.tsx` and its component tests, and the web re-export/consumer. Also read `AGENTS.md`, `docs/governance/CONSTITUTION.md`, and `.sdlc/tasks/ST-051a.md`.

## Review result

Approved for the callback-only identifier-entry scope; no blocking security finding.

- The shared normalizer rejects Unicode Cc/Cf controls before trimming, rejects whitespace inside email addresses, validates the ASCII domain shape, and only emits normalized syntax. Phone values are reduced to international `+` digits with the UI channel preserved as `phone`; formatting characters are constrained and Swedish national/0046 prefixes are normalized.
- The UI has no route or network call and no token, provider, account lookup, identity selection, logging, or persistence behavior. It calls the supplied callback with a valid discriminated result after successful normalization. Invalid values cannot continue through the button. Mode changes clear both the prior value and its error.
- The callback proves only that input passed this local syntax check. It does not prove address ownership, account existence, OTP delivery, or identity. The task explicitly leaves OTP/BankID, profile/household orchestration, and native-device validation incomplete.
- The acceptance scope intentionally uses a lightweight syntax check, not a complete email/mailbox validator. In particular, local-part case is preserved and unusual printable characters may pass; any later account or authentication flow must continue to verify the identifier server-side and must not treat this callback as proof.
- No stale-state or double-invocation defect was evident: each UI submit handler normalizes the current rendered channel/value and calls the callback once for that submit event. Repeated user submissions are separate events.

## Validation evidence and limits

This was a read-only source review. I did not run tests or modify source. The task owner reported 8 mobile tests, 96.96% statement / 87.5% branch / 100% function and line coverage, TypeScript pass, and four RN-web states passing; I have not independently verified those runs. There is no native-device validation claim in this review. The repository working tree already contained task changes when inspected, and I left it unchanged.

Tool calls: mandatory `skills.read({package: 'c0/setup'})` and three read-only `exec_command` calls; final call wrote this report.
