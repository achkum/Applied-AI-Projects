# SubTrack release and recovery runbook

## Gates

Run `npm ci && npm run check`, then `npm --prefix SubTrack/packages/household-core test`. A release is blocked by any failing gate or critical/high security finding. Record the commit, environment, fixture version, results, known risks, and approver on ACH-8.

## Smoke check

Start `npm start`, request `/`, connect the deterministic sandbox, and confirm 11 imported transactions and three recurring candidates. Health output and logs must contain no credentials, account identifiers, descriptions, names, emails, or correction text.

## Rollback

Redeploy the last known-good immutable artifact. Run backward-compatible database migrations only; when a migration cannot be reversed, restore from the rehearsed backup and verify tenant isolation, consent status, and ingestion idempotency before restoring traffic.

## Incidents

For suspected cross-tenant disclosure, disable the affected route/feature flag, preserve privacy-safe correlation IDs, notify the security owner, and do not restore service until the authorization matrix passes. For provider outage, pause ingestion and show stale-data state; never retry aggressively. For deletion failure, quarantine retries, alert immediately, and retain only payload-free tombstones.

## Credential rotation

Rotate provider and session secrets through the deployment secret store, invalidate prior credentials, restart workers, and verify that logs and traces contain neither old nor new values.
