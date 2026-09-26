# SubTrack AI Insights and Release Hardening

## Outcome

Ship a privacy-first SubTrack release whose insights explain patterns rather than merely repeating arithmetic, whose data controls are explicit and auditable, and whose release can be reproduced from automated evidence.

## 1. Explainable non-arithmetic insights

Insights are deterministic interpretations over normalized subscription events. They do not initiate payments, infer sensitive traits, or claim certainty beyond the supporting data.

Each insight must include:

- a stable type and version;
- a plain-language claim;
- the evidence used (subscription/event IDs, observation window, comparison baseline);
- confidence (`low`, `medium`, or `high`) with a reason;
- generated-at and expires-at timestamps;
- a suggested next action that is optional and reversible;
- an explanation view answering “Why am I seeing this?”;
- dismissal and feedback controls.

Initial insight types:

1. **Likely price change** — detects a sustained amount shift for the same merchant after normalization. Require at least two observations before and two after the change; suppress when currency, cadence, merchant mapping, or split rules changed.
2. **Possible duplicate coverage** — identifies subscriptions in the same service category with overlapping active periods. Phrase as a question, never as a definitive duplicate; show the category and subscriptions that caused the match.
3. **Low-confidence recurring charge** — highlights recurrence candidates whose cadence or merchant identity remains ambiguous and asks for confirmation rather than silently classifying them.
4. **Household action needed** — explains when an invitation, split confirmation, correction, or completion step is outstanding and names only data visible to the current member.
5. **Unexpected renewal pattern** — detects a missed, early, or cadence-shifted renewal against the prior observed pattern, with tolerance stated in the explanation.

Quality rules:

- Never present totals, averages, or projected spend alone as an “AI insight.”
- Never use raw transaction descriptions in model prompts or telemetry.
- Prefer deterministic rules for the initial release; if a model is later introduced, keep the same evidence contract and record provider/model/prompt version without storing prompt data containing financial details.
- Do not generate an insight when required evidence is missing, stale, disputed, or outside the viewer’s authorization scope.
- Display “Based on observed data, not financial advice” where recommendations could be mistaken for financial guidance.

## 2. Privacy and data controls

Required user controls:

- granular connection consent with purpose, data categories, retention, and revocation effects;
- disconnect a bank/provider without deleting the account immediately;
- delete imported financial data and derived insights;
- delete the account, including household membership and pending invitations;
- export the user’s normalized data, corrections, consents, and audit history in a portable format;
- explicit household sharing: private by default, per-subscription sharing, audience preview, and confirmation before expanding visibility;
- revoke sharing and immediately invalidate affected household views and insights;
- inspect and correct merchant, recurrence, category, ownership, and split decisions.

Enforcement:

- server-side authorization on every resource; never rely on UI hiding;
- least-privilege provider scopes and encrypted credentials managed outside application logs;
- encryption in transit and at rest;
- retention jobs with auditable deletion tombstones but no retained financial payload;
- derived data follows source-data deletion and visibility changes;
- audit events for consent, connection, export, deletion, invitation, sharing, correction, and privileged access;
- logs, traces, analytics, and error reports exclude tokens, account numbers, transaction descriptions, names, emails, and free-text corrections.

## 3. Observability

Use structured events with correlation IDs and pseudonymous actor/household identifiers.

Key signals:

- ingestion attempts, latency, freshness, normalization failures, and provider error class;
- recurring-detection precision proxies: confirmation, correction, dismissal, and reclassification rates;
- insight generation counts by type/version/confidence plus shown, opened, dismissed, acted-on, and reported-wrong events;
- authorization denials, cross-tenant access attempts, consent revocations, export/deletion progress, and deletion failures;
- invitation and split workflow completion/failure rates;
- API latency/error rate, job queue depth/age, database saturation, and client crash rate.

Alerts:

- elevated authentication or authorization failures;
- any confirmed cross-tenant disclosure;
- ingestion freshness beyond the product SLO;
- deletion or revocation job outside its completion SLO;
- sustained API error/latency breach;
- abrupt insight-volume, dismissal-rate, or correction-rate regression after a rules version change.

Dashboards must link metrics to runbooks and release versions. Production health checks must test dependencies without returning secrets or customer data.

## 4. Security verification

Automated tests must cover:

- object-level authorization for users, connections, transactions, subscriptions, households, invitations, splits, insights, exports, and audit records;
- tenant-boundary matrix tests using two unrelated users and two households;
- invitation expiry, replay, wrong-recipient, enumeration, and privilege-escalation cases;
- consent revocation and deletion propagation to cached and derived data;
- export authorization and time-limited download access;
- webhook signature, timestamp, replay, malformed payload, and idempotency behavior;
- token and credential redaction from logs, traces, exceptions, analytics, and client responses;
- CSRF protections where cookie authentication is used, secure cookie flags, origin controls, rate limits, and brute-force protections;
- input validation, mass-assignment resistance, query injection resistance, and safe rendering of provider/user text;
- dependency and secret scanning in CI.

Any critical/high security finding blocks release. Medium findings require an owner, dated remediation, and explicit release acceptance.

## 5. End-to-end release matrix

Run against deterministic MockBankProvider fixtures first, then the configured sandbox provider when credentials are available.

Critical journeys:

1. Sign up/sign in, grant consent, connect, ingest, normalize, and see subscriptions.
2. Correct merchant and recurrence; verify downstream list, detail, dashboard, and insight evidence update.
3. Generate each insight type; verify explanation, confidence, evidence, action, dismissal, feedback, expiry, and stale-evidence suppression.
4. Create household, invite/accept, share selected subscription, configure equal/percentage/fixed/custom split, settle, and complete.
5. Verify a non-member and an unshared household member cannot access the subscription, transaction, insight, or audit data by UI or direct API request.
6. Revoke sharing and confirm immediate denial plus derived-insight invalidation.
7. Disconnect, reconnect, and ensure idempotent ingestion without duplicates.
8. Export data and verify completeness; revoke consent/delete data and verify source, cache, search, and insight removal.
9. Exercise empty, loading, partial, stale-provider, retry, offline, and unrecoverable error states on a mobile viewport.
10. Deploy from a clean checkout, run migrations, execute smoke checks, roll back, and confirm recovery instructions.

## 6. Release gates and evidence

Release is approved only when all are true:

- lint/typecheck/build and unit/integration suites pass from a clean checkout;
- critical journeys pass on the supported browser/mobile matrix;
- authorization matrix and security suite pass with no critical/high findings;
- migration forward/rollback rehearsal succeeds on production-like data;
- privacy export, revocation, and deletion evidence is captured;
- observability dashboards and alerts are exercised with synthetic failures;
- accessibility checks cover keyboard use, labels, focus, contrast, and reduced motion;
- performance budgets and declared SLOs are met;
- deployment, rollback, incident, provider-outage, credential-rotation, and deletion-failure runbooks are linked;
- release version, commit, environment, fixture version, test results, known risks, and approver are recorded on the task.

## 7. Implementation sequence

1. Land the engineering foundation and individual/household flows.
2. Add the insight evidence schema and deterministic rules behind a feature flag.
3. Add user controls and derived-data invalidation.
4. Instrument privacy-safe telemetry and alerts.
5. Add the security and end-to-end suites.
6. Run the full release matrix in a clean environment and attach evidence.
7. Only then unblock the GitHub release task.

## Dependencies

Implementation and full verification require completion of:

- ACH-5 — Engineering foundation
- ACH-6 — Core individual experience
- ACH-7 — Household value loop

This document is the acceptance contract for resuming ACH-8 when those dependencies complete.
