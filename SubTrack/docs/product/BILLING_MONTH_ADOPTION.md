# Billing Month adoption — feature and delivery map

Founder-approved design reference2026-10-13, exact SHA in DESIGN_DIRECTION. This specification extracts the selected template without treating fictional data, inline comments or JS implementation as authoritative backend/security rules. Existing native enrollment, BankID, profile, Add/Edit/status, detection and Ask requirements survive omissions in the template. Adopt appearance into existing delivery groups; do not make individual cards/icons/helpers separate backlog tickets.

Founder correction 2026-10-15: production and sandbox share the same product screens, design and navigation. Sandbox configuration selects isolated storage/session and simulated external-provider adapters, with concise truthful test disclosure inside those shared screens. Do not add sandbox-only signup, landing, profile or home pages. Production contact/BankID proofs remain exclusively in the production adapter; sandbox simulation cannot create those proofs or call private production enrollment endpoints. Successful profile and Just me setup opens Billing Month only after authoritative durable readback. Technical fixture forms and source-only token adoption do not satisfy the approved design.

| Delivery group | Added/clarified template acceptance |
|---|---|
| ST086 Personal subscriptions | Apply actual fonts/palette/icons to account/profile/Just me/list/Add/Edit/status. Search and category groups/subtotals; usable no-match/loading/error states; preserve storage/revocation/restart behavior. |
| ST082 Home/detail/history | Month timeline/ribbon and upcoming dated rows; a selected day exposes every item. Scope-aware monthly/annual projections and delta need exact deterministic definitions. Detail sheet: plan/current/previous amount, expected next date, available payer/users, sourced history; no inferred Paid. |
| ST069 Bank sync | Replace static Tink/two-account/Active examples with actual synthetic/sandbox provider state under existing authorization. |
| ST081 Detection/review | Keep confirm/reject/edit/merge/undo/feedback requirements; template does not implement them. |
| ST055 Household/privacy | Members, payer distribution, shared/private labels and scope chips require actual membership/visibility; repeat member selection returns to Everyone only within authorized scope. Invitations/dependants remain. |
| ST043 BankID | Mandatory test/simulator verification remains despite absent enrollment flows. |
| ST104 Sharing/settlements | Effective sharing/splits, per-person amounts, mark settled/undo/history backed by exact Money and durable current authority. No payment or provider execution. |
| ST121 Catalogue/comparison | Sourced price/alternative/annual-plan examples with verification dates; template market copy is fictional. |
| ST127 Insights | Expandable explainable score, contribution chips, recap/action cards, price changes and trend chart backed by persisted findings/evidence. No arbitrary score formula from fixture68/100. |
| ST128 Preferences/reminders/Ask | Durable notification settings and local/test reminders; Ask/inbox/quiet hours remain missing. Real delivery still separately authorized. |
| ST145 Device quality | Bundle proper fonts/vector icons/themes, motion reduction, safe areas, AA contrast, font scaling, chart alternatives and sheet focus in real device matrix. |
| ST160 Operation | Existing private monitoring/backup/restore requirements unchanged; not represented in template. |
| ST163 Data rights/legal | Privacy/Help/log-out are inert template rows: require real supported workflows; data rights/legal still explicit. |
| ST167 Stores/download gateway | Actual native assets/build/signing/device evidence and verified download destinations; no public/store release authorization. |

## Data and interaction semantics
Template uses hard-coded October2026/TODAY13 and31 ribbon slots. Select the real local calendar month and support month boundaries/leap years; retain the separate reviewed today..29 upcoming-renewals view. Show every subscription sharing a date. Do not derive payment from date: past saved dates stay earlier expected dates until actual charge evidence exists.

Template totals, delta, payer distribution, savings, market prices, historical charts, bank status and score are fixtures. Define and validate each live projection against accepted data/Money contracts. Per-person Math.round and generic JS floats must not enter production Money logic. No faux projections or snapshot completeness across concurrent page reads. Detail sharing/private state must update authorized durable membership/splits consistently; no client-side owner selectors. Cancellation guidance may explain provider steps; a reminder toggle alone does not mean durable scheduling or real notification delivery.

Notification/sharing/settlement/reminder demo mutations are memory-only. Track their persistence, cancellation/undo and revocation semantics inside the existing corresponding delivery groups. Theme and language require durable per-device preferences and bilingual error/accessibility labels. Unavailable household/insight/bank features must not render fabricated private data.

## First resumed executable feature: ST247
Approved design foundation plus current-owner expected Billing Month. Read all existing owner pages to terminal cursor with unchanged Bearer/profile/Just me/privacy/generation guards, project ACTIVE explicitly saved dates into the selected calendar month, render a multi-item day ribbon and read-only detail, and link existing Add/Edit/status management. An optional displayed sum means only saved expected dates in that month and uses existing packages/money; it is not normalized full spend or a paid-charge total. Missing dates remain unknown. Preserve the thirty-day agenda and all parent native acceptance gates. Broader household/splits/insights/annual normalized totals/history remain unfinished in their existing groups.

ST247 has a frozen path/authority contract. Independent design/client/platform/security review, source checks and actual installed Android/iOS/readback/pixels are required before acceptance. Supplied reference authorizes the direction, not code acceptance or public release.
