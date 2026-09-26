# SubTrack MVP1 product and UX specification

Status: implementation-ready baseline  
Product: SubTrack  
Market: Sweden/EU  
Platform: mobile-first responsive web  
Scope: Tink Sandbox and deterministic mock data only

## 1. Product outcome and principles

SubTrack helps a person discover recurring subscription spending, correct the results, and selectively coordinate shared costs with a household. The MVP succeeds when a user can connect a sandbox bank, review recurring-payment candidates, maintain an accurate subscription list, explicitly share chosen subscriptions, configure splits, calculate a settlement, and mark it complete.

Principles:

1. **Private by default.** Joining a household reveals no accounts, transactions, merchants, balances, or subscriptions.
2. **Explicit sharing.** A subscription enters a household only after its owner chooses it, previews exactly what will be revealed, and confirms.
3. **Explainable detection.** Every recurring candidate shows the evidence behind the suggestion and can be accepted, edited, or dismissed.
4. **Deterministic money.** Amounts, splits, rounding, and settlements are application logic; AI may explain but never calculate.
5. **Reversible actions.** Disconnecting a provider, unsharing a subscription, leaving a household, and deleting data have clear consequences and confirmation.
6. **One-handed clarity.** Primary tasks fit a narrow viewport, use a single dominant action, and never rely on hover.

## 2. Scope and roles

### MVP1 includes

- Account creation, sign-in, sign-out, and session recovery.
- Tink Sandbox or mock-provider connection, consent, sync status, disconnect, and reconnect.
- Normalized accounts and transactions for the signed-in owner only.
- Recurring-payment detection, review, correction, dismissal, and manual subscription creation.
- Dashboard, subscription list, subscription detail, and lightweight explainable insights.
- Household creation, invitation, membership, explicit subscription sharing, split rules, settlement calculation, and completion tracking.
- Data export and account deletion.

### Explicitly out of scope

- Production banking, payment initiation, Swish, cancellation on a user's behalf, native mobile apps, broad budgeting, investments, credit, insurance, crypto, and autonomous financial decisions.

### Roles

- **Individual:** owns bank connections, transactions, detected candidates, and subscriptions.
- **Household owner:** creates the household and can invite or remove members; ownership does not grant access to private financial data.
- **Household member:** can see household membership, explicitly shared subscription records, configured splits, and settlements.
- **Subscription owner:** controls whether their subscription is shared and may edit or unshare it.

Household owner and subscription owner are separate permissions. No household role can inspect another person's unshared data.

## 3. Information architecture

Mobile bottom navigation:

- **Home:** overview, sync state, monthly estimate, next charges, actions requiring review.
- **Subscriptions:** accepted subscriptions and candidates awaiting review.
- **Household:** members, shared subscriptions, splits, and settlements.
- **Settings:** bank connection, privacy, export, account deletion, and session controls.

Detail and setup screens use a back action and do not add more navigation tabs. Desktop may render the same destinations in a side rail.

## 4. Prioritized user stories and acceptance criteria

Priority meanings: **P0** completes the MVP value loop; **P1** makes that loop safe and usable; **P2** is valuable only after P0/P1 are stable.

### P0 — identity and provider connection

**US-01 — Create and access my account**  
As a person, I want a secure account so my financial data and household choices are isolated from other users.

Acceptance criteria:

- A user can register, sign in, sign out, and recover an expired session without losing saved data.
- Authentication errors do not reveal whether an email address exists.
- Protected routes redirect an unauthenticated user to sign-in and return them to the intended route after success.
- A user sees the privacy promise before initiating a bank connection.

**US-02 — Connect a sandbox bank**  
As a user, I want to connect a Tink Sandbox institution so SubTrack can find recurring payments.

Acceptance criteria:

- The connection screen identifies the provider as sandbox/test data and states what data is requested and why.
- The user must actively consent before redirecting to the provider.
- Success returns the user to SubTrack, begins sync, and shows progress without requiring the page to stay open.
- Cancelling or provider failure returns to a recoverable state with retry and mock-data alternatives.
- Duplicate callbacks or retries do not create duplicate connections or transactions.

**US-03 — Understand connection state**  
As a user, I want to know whether my data is current and what to do when it is not.

Acceptance criteria:

- Home and Settings show one of: connected/synced with timestamp, syncing, action required, disconnected, or unavailable.
- Partial sync distinguishes usable existing data from data that failed to refresh.
- Reconnect preserves reviewed subscriptions and does not silently re-share anything.

### P0 — detect and curate subscriptions

**US-04 — Review recurring-payment candidates**  
As a user, I want to verify detected subscriptions so my list is trustworthy.

Acceptance criteria:

- Each candidate shows normalized merchant, recent charge amount, estimated cadence, next-charge estimate, source account label, and concise detection evidence.
- The user can accept, edit then accept, or dismiss a candidate.
- Accepting creates one subscription and is idempotent.
- Dismissing removes the candidate from the active queue but can be reversed from Settings or history.
- Low-confidence candidates are never silently accepted.

**US-05 — Correct a subscription**  
As a user, I want to edit an incorrect name, amount, cadence, category, or next date.

Acceptance criteria:

- Editing clearly distinguishes detected values from user overrides.
- Currency and amount validation prevents invalid or ambiguous money values.
- Saving updates future estimates without changing historical source transactions.
- A user can remove their override and return to the latest detected value.

**US-06 — Add a subscription manually**  
As a user, I want to add a recurring cost that was not detected.

Acceptance criteria:

- Required fields are name, amount, currency, and cadence; next date is optional.
- A duplicate warning appears for a close merchant/amount/cadence match but does not block creation.
- A manual item is labelled as user-created and can be edited or archived.

**US-07 — See my subscription picture**  
As a user, I want a usable overview of recurring costs and upcoming charges.

Acceptance criteria:

- Home shows an estimated monthly total, upcoming charges, and candidate-review count.
- The subscription list supports active, needs-review, and archived states.
- Non-monthly costs use a documented monthly-equivalent calculation while preserving the original cadence and amount.
- Estimated values are labelled; no screen implies a guaranteed future charge.

### P0 — household value loop

**US-08 — Create a household**  
As a user, I want to create a household without exposing my private finances.

Acceptance criteria:

- Creation requires a household name and displays the privacy boundary before confirmation.
- The creator becomes household owner, but no personal subscription is shared automatically.
- The empty household screen explains that membership and sharing are separate actions.

**US-09 — Invite and join a member**  
As a household owner, I want to invite another person so we can coordinate selected costs.

Acceptance criteria:

- An invite has a single-use token, expiry, inviter identity, household name, and accept/decline actions.
- The invitee sees exactly what joining reveals before accepting.
- Expired, revoked, already-used, and wrong-account invites have distinct recovery messages.
- Accepting reveals only the member's display identity to the household; it shares no financial records.

**US-10 — Explicitly share a subscription**  
As a subscription owner, I want to choose which subscription a household can see.

Acceptance criteria:

- Sharing starts only from a specific subscription or an explicit multi-select sharing flow.
- A preview lists every field that will become visible: display name, amount, currency, cadence, next-charge estimate if present, owner identity, split rule, and sharing history/status.
- The preview states that source account, raw transaction text, transaction history, balances, and unrelated subscriptions remain private.
- Confirmation creates an auditable share event; cancelling creates no household-visible record.
- Editing a shared amount, cadence, or next date warns that household totals will change and records an audit event.

**US-11 — Configure a split**  
As a household, I want a clear split rule for each shared subscription.

Acceptance criteria:

- Supported methods are equal, percentage, fixed amount, and custom allocation.
- The UI previews each member's amount before save.
- Percentages must total 100%; fixed/custom amounts must total the subscription amount in its currency.
- Equal-split remainder cents are allocated by a stable documented order, producing the exact total.
- Invalid or incomplete splits cannot be activated; the previous valid rule remains effective.

**US-12 — Calculate and complete a settlement**  
As a household member, I want to see what I owe or am owed and record completion.

Acceptance criteria:

- Settlement uses only active shared subscriptions, their active split versions, the selected period, and deterministic decimal arithmetic.
- The review screen shows inputs, per-subscription contributions, net amounts, rounding, period, and generation timestamp.
- A calculation can be regenerated when underlying inputs change; old versions remain auditable.
- Marking complete records who confirmed, when, and the amount; it does not initiate a payment.
- Completion requires confirmation and can be corrected with an explicit reason rather than silent deletion.

### P1 — control, privacy, and resilience

**US-13 — Unshare a subscription**  
As a subscription owner, I want to stop future household visibility without corrupting history.

Acceptance criteria:

- A confirmation explains that the item disappears from future household calculations but remains in prior settlement records.
- Unsharing is immediate for new views and creates an audit event.
- Other members lose access to current detail; historical settlement line items retain only the minimum snapshot needed for audit.

**US-14 — Leave or remove a member**  
As a member or owner, I want membership changes to have predictable financial effects.

Acceptance criteria:

- The confirmation previews affected active splits and requires replacement rules before future settlements if removal would invalidate them.
- A member cannot see household data after removal/leave, except their own retained records required for completed-settlement history.
- Household ownership must be transferred before the current owner can leave, unless they delete the household.

**US-15 — Disconnect the provider**  
As a user, I want to revoke ongoing bank access while understanding what remains.

Acceptance criteria:

- The confirmation distinguishes provider revocation from deletion of imported data.
- Disconnect stops refresh and marks estimates stale; it does not silently delete curated subscriptions.
- The user can reconnect or proceed to account/data deletion.

**US-16 — Export and delete my data**  
As a user, I want access to my data and a safe way to delete it.

Acceptance criteria:

- Export describes included data, produces a downloadable machine-readable archive, and does not include another member's private data.
- Account deletion explains provider revocation, membership effects, owned shared subscriptions, completed-settlement retention/minimization, and irreversibility.
- A destructive confirmation is required; deletion runs asynchronously with visible status and a failure-recovery path.
- Legal/audit retention, if any, is disclosed by category and duration rather than implied to be immediately erased.

**US-17 — Understand insights**  
As a user, I want simple observations that I can verify.

Acceptance criteria:

- An insight cites the subscriptions and time window behind it and is labelled as an estimate.
- Insights never expose another member's private data, perform settlement arithmetic, or imply financial advice.
- The user can dismiss an insight and report it as unhelpful.

### P2 — post-stability enhancements

- Bulk review of candidates with individual undo.
- Household activity feed with privacy-safe events.
- Custom reminder preferences for upcoming charges and settlement due dates.
- Advanced filters, category trends, and subscription price-change history.

## 5. Mobile-first end-to-end flows

### Flow A — first value: connect to reviewed subscriptions

1. Welcome: concise value statement, privacy promise, **Get started**.
2. Register/sign in.
3. Connect bank explainer: requested data, sandbox label, revocation path.
4. Consent confirmation, then provider redirect.
5. Return state: connection succeeded and sync is running.
6. Candidate queue: one card at a time on small screens; accept, edit, dismiss.
7. Completion: reviewed count, monthly estimate, **Go to Home**.
8. Home: next charges, total estimate, remaining review badge.

If the user skips connection, route to a useful empty Home with **Try sample data** and **Connect bank**. Sample data must be clearly labelled and removable.

### Flow B — correct or manually add a subscription

1. Subscriptions → select item or **Add subscription**.
2. Edit form with visible original/detected values where applicable.
3. Inline validation and duplicate warning.
4. Save → detail screen with a short success notice and undo when safe.

### Flow C — create a household and invite

1. Household empty state → **Create household**.
2. Enter name; review private-by-default statement.
3. Household landing shows no shared costs and prompts two independent actions: **Invite member** and **Share a subscription**.
4. Invite: choose secure link delivery/copy, see expiry and revoke control.
5. Invitee opens link, signs in if needed, reviews membership disclosure, accepts or declines.
6. Both see membership update; neither sees the other's financial data.

### Flow D — share and split a subscription

1. Subscription detail → **Share with household**.
2. Choose household if more than one is ever supported; MVP may constrain to one.
3. Disclosure preview separates **Household will see** from **Stays private**.
4. Confirm share.
5. Choose split: equal, percentage, fixed, or custom.
6. Live per-member preview; validation must pass.
7. Save → shared subscription detail with owner, split, visibility, and **Unshare**.

### Flow E — calculate and complete settlement

1. Household → Settlements → **Calculate settlement**.
2. Select period and review eligible shared subscriptions.
3. Results show per-item allocation and net member positions.
4. Confirm **Create settlement record**.
5. Member records an offline payment as complete; confirmation states SubTrack does not move money.
6. Settlement detail shows completed/pending states and audit history.

### Flow F — disconnect, export, or delete

1. Settings → Data & privacy.
2. Choose disconnect, export, or delete.
3. Consequence preview tailored to the action.
4. Re-authenticate for export/deletion when the session is not recent.
5. Confirm → progress/result screen with retry or support-safe reference on failure.

## 6. Screen inventory and required states

| Area | Screen | Primary action | Required secondary states |
|---|---|---|---|
| Auth | Welcome / sign in / register | Continue | validation, expired session, rate limit, generic auth error |
| Onboarding | Connect-bank explainer | Connect sandbox bank | skip/sample data, provider unavailable |
| Provider | Return and sync status | Review results | cancelled, denied consent, partial sync, retry |
| Home | Personal dashboard | Review candidates | no connection, syncing, no subscriptions, stale data, offline |
| Subscriptions | List with review segment | Add subscription | empty, filtered empty, loading, stale, failed refresh |
| Subscriptions | Candidate review | Accept | edit, dismiss, no candidates, detection evidence unavailable |
| Subscriptions | Detail/edit | Save changes | archived, shared warning, source transaction unavailable |
| Household | Empty/create | Create household | privacy explainer, creation failure |
| Household | Landing | Share subscription | no members, no shared items, invalid splits, invite pending |
| Household | Invite / join | Send or accept | expired, revoked, used, wrong account, network failure |
| Household | Share preview | Confirm share | no eligible subscriptions, permission loss, stale subscription |
| Household | Split editor | Save split | totals invalid, member changed, currency mismatch |
| Settlement | Setup/review | Create record | no eligible items, stale inputs, calculation error |
| Settlement | Detail | Mark complete | already completed, correction flow, permission loss |
| Settings | Bank connection | Reconnect/disconnect | revocation failure, disconnected, sync required |
| Settings | Data & privacy | Export/delete | preparing, ready, expired download, deletion queued/failed |

## 7. Empty, loading, offline, and error behavior

Every state must answer: what happened, whether existing data is safe, and what the user can do next.

### Empty states

- **No bank connected:** explain the value and privacy boundary; offer **Connect bank** and clearly labelled **Try sample data**.
- **Syncing with no data yet:** skeletons plus progress copy; user may leave safely.
- **No candidates:** celebrate that review is complete; offer manual add and refresh timestamp.
- **No accepted subscriptions:** distinguish “nothing detected” from “candidates still need review.”
- **No household:** explain that household data is opt-in and separate from personal data.
- **Household with no members:** offer invite; do not pressure the user to share first.
- **Household with no shared subscriptions:** say that membership shares nothing automatically; offer explicit sharing.
- **No settlement items:** identify whether there are no shared subscriptions, no valid splits, or no charges for the period.

### Loading and offline

- Preserve the last successful data with a “last updated” label; avoid blanking the entire screen during refresh.
- Disable duplicate submissions while keeping back navigation available.
- Offline edits that affect money or privacy are not silently queued. Save as a local draft where safe and require explicit submission after reconnection.
- Never show a success state until the server confirms the mutation.

### Error taxonomy and recovery

- **Validation:** inline at the field, focus the first error, preserve all entered values.
- **Authentication/session:** explain that the session expired, re-authenticate, then resume the action without double submission.
- **Provider cancelled/denied:** neutral copy, no blame; retry or return to Home.
- **Provider unavailable/rate limited:** show existing data as stale, retry later, and offer mock data during onboarding.
- **Sync partial:** list which connection/account failed without exposing sensitive raw payloads; allow targeted retry.
- **Conflict/stale edit:** show that the record changed, reload the latest version, and preserve the user's attempted edits for comparison.
- **Permission changed:** stop the action, remove newly inaccessible data from view, and return to the nearest permitted screen.
- **Calculation invariant failure:** create no settlement, keep the previous valid state, show a safe reference ID, and offer retry.
- **Destructive action failure:** state whether revocation/deletion completed, partially completed, or did not start; never imply completion from a timeout.

## 8. Household privacy and permission contract

### Private by default

Creating or joining a household reveals only:

- display name or chosen household identity;
- membership role and status;
- invite and join timestamps needed for coordination.

It does **not** reveal:

- bank provider or connection status;
- account names, identifiers, types, or balances;
- raw or normalized transactions;
- candidate subscriptions or dismissed candidates;
- personal totals, categories, insights, exports, or unrelated subscriptions.

### Visibility matrix

| Data/action | Individual owner | Other household member | Household owner |
|---|---:|---:|---:|
| Own accounts, balances, transactions | Yes | No | No, unless it is their own |
| Own candidates and private subscriptions | Yes | No | No, unless it is their own |
| Shared subscription display snapshot | Yes | Yes | Yes |
| Shared source account / raw transaction | Yes | No | No, unless it is their own |
| View active split and member allocations | Yes | Yes | Yes |
| Change subscription fields or sharing | Subscription owner only | No | No, unless owner |
| Propose/edit split | Yes if policy permits | Yes if policy permits | Yes |
| Activate split | Subscription owner for MVP | No | No, unless owner |
| Invite/remove household members | No by default | No | Yes |
| Leave household | Yes | Yes | Yes, after transfer/delete rules |
| View completed settlement record involving member | Yes | Yes, scoped to household record | Yes |

### Shared subscription snapshot

Household-visible fields are limited to:

- user-facing subscription name;
- amount and currency;
- cadence and next-charge estimate, if present;
- subscription owner display identity;
- active split rule and each member's allocation;
- sharing, update, and unsharing timestamps;
- minimum immutable snapshot embedded in a completed settlement.

Source transaction IDs, raw descriptions, account references, provider metadata, detection features, and unrelated history must never be serialized into a household response.

### Authorization requirements

- Enforce authorization on the server for every object and nested resource; hidden UI is not a security boundary.
- Query household views from explicit share records, never from all subscriptions owned by members.
- Use deny-by-default field projection for household APIs.
- Audit membership, invite, share, unshare, split activation, settlement creation/completion/correction, export, disconnect, and deletion events.
- Audit logs exposed to members contain privacy-safe summaries, not transaction payloads or secret identifiers.
- Invite links are expiring, revocable, single-use, and stored hashed where feasible.
- Revoking membership or a share invalidates access immediately and applies to cached responses and download links.

### Lifecycle rules

- **Edit:** household-visible changes require a warning and an audit event; calculations use the version active for their period/version.
- **Unshare:** removes future access and future settlement eligibility; completed settlements keep only their immutable minimal snapshot.
- **Member leaves/is removed:** access ends immediately; future splits must be repaired before use; completed settlement records remain minimally visible to participants.
- **Owner deletes account:** require transfer or closure of household ownership and resolve active shared items before deletion completes.
- **Household deletion:** revokes all shares and invites; personal subscriptions remain private with their owners; completed records follow the disclosed retention policy.

## 9. Financial and content rules

- Store money as integer minor units plus ISO currency; never use binary floating point.
- Do not combine currencies into one total unless a deliberately versioned exchange-rate feature exists; it is out of scope for MVP1.
- Monthly equivalent must use a single documented formula, e.g. weekly × 52/12 and annual ÷ 12, rounded only for display.
- Settlement calculations retain unrounded intermediate minor-unit rules and reconcile exactly to source totals.
- Dates and periods use the user's selected locale/time zone while persisted instants use UTC.
- Use “estimated,” “record payment,” and “mark complete”; do not say “guaranteed,” “pay now,” or imply SubTrack cancelled a service or transferred money.
- Swedish/English localization readiness: never embed semantic meaning only in date/number formatting, color, or iconography.

## 10. Accessibility and responsive requirements

- Target WCAG 2.2 AA for core flows.
- Minimum 44×44 CSS-pixel touch targets; logical focus order; visible keyboard focus.
- All fields have persistent labels, errors are programmatically associated, and status changes use non-disruptive live regions.
- Color is never the only indicator for confidence, debt/credit position, sync, or errors.
- Modals and bottom sheets trap focus correctly and restore it on close; destructive actions remain understandable as full pages on small screens.
- At 320 CSS pixels wide, no horizontal page scrolling is required for primary flows; financial tables become labelled stacked rows.
- Respect reduced motion and dynamic text sizing; totals do not truncate significant digits or currency.

## 11. Product analytics without financial leakage

Permitted analytics are coarse events such as onboarding step completed, candidate reviewed, household created, share confirmed, split type chosen, and settlement record completed. Do not send merchant names, transaction text, account identifiers, amounts, member identities, invite tokens, or free-form error payloads to analytics. Use pseudonymous user identifiers, documented retention, and consent appropriate to Sweden/EU deployment.

## 12. Definition of done and end-to-end acceptance

The UX is implementation-ready when:

- Each P0/P1 story is mapped to a screen/route, API permission, and test case.
- All screens in the inventory implement loading, empty, success, stale, offline, validation, authorization, and server-error behavior where applicable.
- Automated tests prove household membership alone returns no personal financial data.
- Automated tests prove only explicit active shares appear in household responses and that unsharing/revocation removes access.
- Split tests cover equal remainders, percentage totals, fixed/custom totals, negative/zero invalid inputs, member removal, and currency isolation.
- Settlement tests prove deterministic replay and exact reconciliation to shared subscription totals.
- The complete narrow-viewport journey passes: register → connect sandbox/mock → sync → review candidate → create household → invite/join → explicitly share → configure split → calculate → mark complete → unshare → disconnect → export/delete.
- Accessibility checks include keyboard-only operation, screen-reader names/errors/status, contrast, zoom/text resizing, and 320-pixel layout.
- No UI, API response, log, analytics event, notification, or export leaks another member's private financial data.

## 13. Implementation sequence

1. Identity, navigation shell, privacy copy, provider connection and sync states.
2. Candidate review, subscription list/detail/edit/manual add, dashboard calculations.
3. Household creation/invites with server-side private-by-default projections.
4. Explicit share preview/audit, split editor, deterministic settlement and completion.
5. Disconnect/export/deletion, lifecycle edge cases, accessibility, analytics minimization, and E2E privacy tests.

This order protects the core individual value before introducing shared-state complexity and makes the privacy boundary testable before household settlement ships.
