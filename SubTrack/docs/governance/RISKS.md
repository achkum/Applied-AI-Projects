# Risk Register (the Conductor reviews it weekly)

| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Tink Sandbox access or redirect needs a domain; IP-based redirect URI rejected | M | M | Synthetic provider first (ADR-0005); buy a cheap domain if Tink Console rejects the IP redirect (D-02) | architect-platform |
| R2 | Apple guideline 5.1.1(ix): financial-services apps may be expected to come from an organisation, not an individual | M | H | TestFlight for the showcase; public release only after company + organisation enrolment (ops/APP_STORES.md) | Conductor/founder |
| R3 | iOS universal links / Android App Links need a domain with .well-known files | H | M | Use custom-scheme deep links + an invite code fallback until a domain exists | architect-client |
| R4 | Codex plan usage limits stall a 13-agent team | H | M | WIP limit of 4, Luna by default, pausing/resuming on limits (DECISION_RULES §7) | Conductor |
| R5 | VPS RAM exhaustion (agents + stack + Playwright) | M | H | Heavy-job mutex, ML scale-to-zero, measure in M0 | devops-release |
| R6 | Free LLM tiers change quotas or terms | H | L | Provider chain + template fallback; LLM is never on the critical path | architect-data |
| R7 | Scraped competitor prices wrong or scraping disallowed | M | M | robots/ToS check, quarantine on >40% change, "last verified" always shown, curated seed | architect-data |
| R8 | Luna-generated code quality insufficient for complex modules | M | M | Sol for architects/review, escalation rule, strong skills/templates | Conductor |
| R9 | Design drifts to "generic fintech" | M | H | Gate G-DESIGN, tokens-only styling (lint rule forbids raw hex in apps) | design-lead |
| R10 | Agents leak secrets or PII into git/Telegram | L | H | Secret scan in CI, pre-commit hook, redaction rule in telegram skill, agents never read prod `.env` | security-privacy |
| R11 | BankID test environment requires a test device setup the founder hasn't done | M | L | Simulator mode is always available; HUMAN_TODO #2 | founder |
| R12 | Legacy repo junk confuses agents | M | L | M0 task ST-002 moves the legacy code into `_legacy/` | Conductor |
