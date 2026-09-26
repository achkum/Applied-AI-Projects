# User Flows (acceptance-level)

Each flow is written as numbered steps. Anything marked **AC** is an acceptance criterion; QA turns every AC into a test.
Screen names are in `Code` style and match the route names in the web and mobile apps.

## UF-01 Welcome → Register (email or phone) → BankID
1. `Welcome`
   - Shows the brand moment (see DESIGN_DIRECTION §5) and three choices: **Create account**, **Log in**, **Explore demo household**.
   - A language toggle (SV/EN) is in the top corner and defaults to the device locale.
2. `Register/Identifier`
   - A segmented control switches between **E-post** and **Mobilnummer**.
   - Phone numbers are normalised to E.164 (+46).
   - **AC:** invalid input shows an inline error. The submit button stays disabled until the input is valid.
3. `Register/OTP`
   - A 6-digit code is valid for 10 minutes.
   - Resend is allowed after 30 seconds, with a maximum of 5 resends per hour.
   - Codes are delivered by email (SMTP provider) or SMS. In dev and test, SMS goes to the `DevInbox` log.
   - **AC:** 5 wrong codes lock the identifier for 15 minutes.
4. `Register/BankID`
   - Desktop web shows an animated QR code (refreshed every second, per BankID RP API v6).
   - Mobile shows an "Open BankID on this device" button (autostart token).
   - In `simulator` mode, a SubTrack-drawn BankID-style sheet asks the user to choose a demo identity and "sign".
   - **AC:** on completion the server stores `bankid_verified_at`, `given_name`, `surname` and an HMAC of the personnummer.
   - **AC:** if that personnummer HMAC already belongs to another account, the flow switches to "Log in instead?".
5. `Register/Profile`: display name (pre-filled from BankID), avatar colour and emoji, language, and theme.
6. `Onboarding/Mode`: **Just me** or **My household**.
   - "My household" continues to UF-02.
   - "Just me" continues to UF-05.

## UF-02 Create household (Admin)
1. `Household/Create`: name (e.g. "Lindqvist HQ"), emoji, and an optional cover gradient.
2. The creator becomes ADMIN. **AC:** no household can have 0 or 2+ admins; this is enforced in the DB with a partial unique index.
3. `Household/Invite`: share sheet with a link and a code, or enter email/phone. It also offers **Add dependant (no login)**.
4. `Household/Pending`: list of invites with status (Sent / Opened / Accepted / Declined / Expired / Revoked).

## UF-03 Invitee accepts or declines
1. Opening the link:
   - Web opens `/invite/:token`.
   - Mobile opens via the universal/app link. If the app isn't installed, the web fallback is shown.
2. Signed-out users run UF-01 steps 2–5 first, including the **mandatory BankID** step, and then return to the invite.
3. `Invite/Decision`
   - Shows the household name, the admin's name, the member count, and a clear privacy explainer: "Your bank data stays yours. You choose what to share."
   - Buttons: **Join** and **Decline**.
4. After **Join**:
   - The user goes to `Privacy/Setup`: the Open book switch (default OFF) with a live preview.
   - Then `Banks/Connect`.
5. After **Decline**:
   - The admin is notified.
   - **AC:** the token is invalidated, and declining is idempotent.
6. **AC:** expired, revoked and already-used tokens show friendly states, with "Ask {admin} for a new invite".

## UF-04 Privacy switch
1. `Settings/Privacy`: the **Open book** toggle, a per-subscription "Always private" list, and a **Preview as household** button.
2. Toggling ON shows a confirmation sheet listing exactly what becomes visible, with counts.
3. **AC:** the change takes effect immediately for other members' next fetch (cache TTL ≤ 5 s), and an audit event `privacy.open_book.enabled` is written.

## UF-05 Connect bank(s)
1. `Banks/Connect`: pick a provider.
   - Tink (sandbox): a list of sandbox institutions.
   - Demo bank (Synthetic): a list of persona accounts.
2. Tink: the Tink Link redirect or webview → callback → code exchange on the server. Tokens are encrypted at rest.
3. `Banks/Syncing`: animated progress ("Reading 24 months… Found 612 transactions… Spotted 19 subscriptions").
4. The user lands in the `Review` inbox.
5. **AC:** a failed sync shows a retry option with a human-readable reason. Partial data is never shown as complete.

## UF-06 Review detections
1. The card stack shows merchant logo/initial, amount, cadence, confidence reasons, and the suggested category and plan.
2. Actions:
   - Confirm (swipe right).
   - Not a subscription (swipe left).
   - Edit (tap), to change category, cadence, name or plan.
   - Merge (combine two detections).
3. **AC:** every action is undoable for 10 seconds. Feedback is stored as labels for the ML classifier.

## UF-07 Dashboard & scope filter
1. `Home` has these sections:
   - The scope switcher (Me · Household · members).
   - The hero total (month), with an annual toggle.
   - A change vs last month.
   - The **Orbit** visual (DESIGN_DIRECTION §4).
   - Upcoming renewals (next 30 days).
   - An insight card carousel.
   - "Better together" savings.
2. **AC:** switching scope animates the numbers (rolling digits) and re-draws the Orbit in under 300 ms using cached data.

## UF-08 Subscription detail
1. Header: logo, name, plan, price per cadence, next charge date, and the paying account (bank name + last 4 digits).
2. Tabs:
   - **Price history**: a step chart with hike annotations.
   - **Compare**: alternatives, with the delta per month and per year, a "last verified" date, and the source.
   - **Split**: owner, payer, beneficiaries and split rule.
   - **Charges**: the list of matched transactions.
3. Actions:
   - Mark shared / personal, and Always private.
   - Pause tracking, Mark cancelled, and Archive.
   - A "How to cancel" guide link (static content, not automation).

## UF-09 Split & settle
1. `Split/Edit`: choose a rule (Equal / Percent / Fixed + remainder / Custom / Exclude).
   - A live preview shows each member's amount in kr.
   - **AC:** percentages must total 100.00%. Fixed amounts can't exceed the price. The UI rejects invalid input *before* the API does.
2. `Settle` (monthly):
   - Per-member net position.
   - Minimised transfers ("Johan → Sara 239 kr").
   - An itemised breakdown and a **Mark settled** button.
3. **AC:** settlement for month M is recomputed deterministically from the charges booked in M and the split rules effective on each charge date.

## UF-10 Insights & Ask SubTrack
1. `Insights`:
   - The forecast chart (12 months, with a band).
   - Category mix.
   - A persona cluster badge.
   - An anomalies list.
   - The monthly recap (LLM text, with a "How we calculated this" disclosure).
2. `Ask`:
   - A chat with suggested prompts.
   - Answers cite the numbers and link to the relevant screens.
   - **AC:** questions about data outside the caller's scope return "I can only see what's shared with you."

## UF-11 Data rights
1. `Settings/Data`: export (async; ZIP download link, valid 24 h), delete connection, delete account.
2. Delete account:
   - Requires BankID re-auth.
   - If the user is the sole admin with other members, they must transfer the admin role first.
   - **AC:** a hard delete of personal data happens within 30 days. The audit record keeps pseudonymous IDs only.

## UF-12 Demo mode
1. "Explore demo household" creates an ephemeral session in the `demo` tenant, seeded with Familjen Lindqvist.
2. It is read-only, apart from local UI state. A banner reads "Demo: data is fictional".
3. **AC:** demo users can never reach real tenants. Demo sessions are rate-limited.
