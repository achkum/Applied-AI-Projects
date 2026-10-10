# SubTrack VPS deployment readiness and ST-160 contract

**Audit date:** 2026-10-10 UTC
**Scope:** read-only review of the checked-out SubTrack repository for the private staging deployment lane. This is a planning artifact, not evidence of VPS access or deployment.

## Readiness finding

The repository has a local development Compose stack, but no deployable application stack yet. The only repository Compose file is `SubTrack/docker-compose.yml`; its services are PostgreSQL 16, Redis 7, Mailpit, a Caddy placeholder that serves a static development message, and the FastAPI ML service. It does not define the NestJS API, Next.js web app, or worker. The only application Dockerfile found is `SubTrack/services/ml/Dockerfile`. There is no Caddyfile, staging/demo Compose file, deployment script, backup script, or VPS runbook command sequence in the repository inventory. The architecture describes API, web, worker, ML, PostgreSQL, Redis and Caddy, but those descriptions are not deployed artifacts.

Consequently, do not claim the full stack is ready or run the existing development Compose file as a staging deployment. The next concrete deployment work belongs in ST-160's existing deployment paths after its task contract is created/expanded; it should produce the real staging Compose/Caddy/deploy/backup artifacts and gather acceptance evidence. Current ST-160 in `.sdlc/backlog.yaml` is BACKLOG, L-sized, owned by `devops-release`, and depends on M1. The supplied `VPS_SETUP.md` layout and sketches are guidance, not an implemented deployment.

## Deployment contract for ST-160

Use the established deployment layout from `docs/ops/VPS_SETUP.md`: `/opt/subtrack/compose`, `/opt/subtrack/secrets`, `/opt/subtrack/data/postgres`, `/opt/subtrack/backups`, and `/opt/subtrack/caddy`. Reuse the secret convention from `docs/HUMAN_TODO.md`: root-owned `/opt/subtrack/secrets/staging.env`, mode 600, mounted by Compose; agents may inspect `.env.example` only. Do not copy development fallback credentials into staging. Keep PostgreSQL, Redis, ML and Mailpit on the private Compose network; publish only Caddy's HTTP/HTTPS listeners. Preserve staging Caddy basic authentication. A public demo route or removing basic-auth needs D-05 approval; public/v1.0 release also needs D-01 and the M7 security/evidence gate.

The deployed service set is Caddy, web, API, worker, ML, PostgreSQL, and Redis. Mailpit is appropriate only for isolated/test mail; real outbound mail requires the provider and delivery mode to be explicitly approved under D-03/D-09. The current worker is explicitly a scaffold no-op (`services/worker/package.json`), so ST-160 must not represent background processing as operational until an implemented worker exists. ML is an internal-only service per `docs/architecture/ARCHITECTURE.md`; the existing Dockerfile exposes port 8000 only for container networking and has a `/healthz` probe in the development Compose file.

Required ST-160 deliverables and acceptance evidence:

1. Add the production-like staging Compose, Caddy configuration, image build definitions for API/web/worker, narrowly scoped deploy entry point and backup/restore procedures at the established paths (`infra/compose`, `infra/docker`, `infra/caddy`, or an explicitly documented replacement). Do not invent a second unrelated deployment layout.
2. Configure readiness/health checks for every runtime service; require PostgreSQL and Redis healthy before dependent services, wait for API/web/worker/ML readiness, and make deployment fail closed if a check fails. Keep application and data ports unbound to the public host. Include explicit CPU/memory/resource assumptions informed by the existing preflight report rather than assuming capacity.
3. Configure TLS at Caddy for the current bare-IP plan only if the actual installed Caddy version/provider supports the short-lived IP certificate profile; verify automated renewal. Keep HSTS short for the IP case. Keep basic-auth on every staging route, including API paths, and store only the bcrypt hash in Caddy config. No credentials in repository or logs.
4. Define a complete staging environment variable inventory from application configuration and `.env.example` without printing values. Validate mandatory values before starting services. Provision distinct random production-grade secrets through the approved root-only VPS secret file; no development defaults, secret reads by agents, or secret values in evidence. Use simulator/synthetic data unless already-approved provider credentials exist; no external account/provider creation.
5. Use a new staging database/volume. Run only reviewed, forward-compatible migrations; do not touch an existing database or perform destructive/reset commands. Demonstrate tenant/RLS isolation with a disposable database role as required by security review. Back up with nightly `pg_dump`, retention of 7 daily and 4 weekly copies, and a successful weekly restore rehearsal before claiming recovery readiness; encrypt/protect backup access and keep backups off the public web root.
6. Capture immutable source revision/image identifiers, Compose health output, authenticated HTTPS smoke results, migration result, no-public-service-bind check, backup artifact metadata and restore-test evidence. Keep the report free of credentials, personal data and sensitive service payloads.

## Security and gate dependencies

The current `docs/ops/SECURITY_FINDINGS.md` says registered privacy/data-rights routes trust caller-supplied `X-Caller-Id` and warns that an internet-reachable API could permit account takeover or destructive requests (T1 Critical if internet reachable, High otherwise). It explicitly requires SEC-FU1 to cover current routes before calling them safe. Do not make these routes reachable from the public internet until the trusted-principal containment is implemented and independently approved. Basic-auth is an outer access gate for staging, not a substitute for API authorization; restrict API routes until the security finding is resolved.

`docs/governance/QUALITY_GATES.md` requires green quality gates, security sign-off and milestone evidence; it states task gates authorize integration, not a production/public release. `docs/governance/DECISION_RULES.md` permits staging behind basic-auth after QA, while D-05 governs new public ports/endpoints or removing staging basic-auth. User authorization to use the VPS does not itself change these repository governance gates. Keep this work private and reversible until applicable gates are met.

## External prerequisites, without blocking private preparation

- The existing VPS host/IP, disk/RAM/CPU headroom, firewall state, Docker/Caddy versions and `/opt/subtrack` ownership are not verified by this audit; use the recorded M0 preflight only as historical evidence, then remeasure before deploying.
- Staging host SSH/deploy permissions and repository checkout/tag are not verified. The ops setup doc expects a narrow deploy script/sudoers rule, but neither is present in the repository inventory.
- Required API/web/worker secret names and values need to be derived from their actual runtime config when the deployable service set is implemented. Do not infer credentials from the development sample.
- A domain, transactional email provider, Tink account, and BankID test setup are optional to private synthetic/simulator preparation. Their absence does not block container/network/backup scaffolding. Creating accounts or credentials, paying for a domain/provider, real email delivery, and public exposure remain governed by D-02/D-03/D-05/D-09.

## Audit call accounting

Repository inventory and file reads completed successfully. No SSH, network access, secret-file read, provider access, deployment command, or database command was attempted. There are no failed external calls to report. This document records repository evidence only; it makes no claim about the live VPS state.

## Source evidence

- `AGENTS.md`; `docs/governance/CONSTITUTION.md`; `docs/governance/DECISION_RULES.md`; `docs/product/ROADMAP.md` M7; `docs/HUMAN_TODO.md`.
- `docker-compose.yml`, `services/ml/Dockerfile`, `.env.example`, `apps/api/package.json`, `apps/web/package.json`, `services/worker/package.json`.
- `docs/architecture/ARCHITECTURE.md`, `docs/architecture/adr/ADR-0008.md`, `docs/ops/VPS_SETUP.md`, `docs/ops/SECURITY_FINDINGS.md`, `docs/release-runbook.md`, `docs/governance/QUALITY_GATES.md`, `.sdlc/backlog.yaml` ST-160/ST-161.
