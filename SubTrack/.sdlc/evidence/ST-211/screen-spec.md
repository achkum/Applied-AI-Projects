# ST-211 registration screen spec (design-lead)

## Evidence and bounds
- Reviewed: `docs/product/DESIGN_DIRECTION.md` (Norrsken tokens/type/shape), `docs/product/USER_FLOWS.md` UF-01, ST-211 task + ADR-0020, `RegistrationScreen.tsx`, `IdentifierEntry.tsx`, tests, and `theme.native.json` / sv/en onboarding catalogs.
- Current UI already uses `bg.canvas`, `bg.raised`, `bg.sunken`, `ink.primary/secondary`, `ember.amber`, Fraunces/Manrope and card/pill radii. Keep that layout vocabulary; do not add colors or promise UF-01's older 10-minute/lock wording: ADR-0020 says five-minute challenge/proof and five wrong attempts, owned server-side.
- Treat copy below as proposed bilingual keys for implementation; this review does not edit shared catalogs or assert runtime/provider/device acceptance.

## Layout and states
- Keep top-left accessible Back, Fraunces title, short Manrope explanation, then one raised surface with 24pt-equivalent spacing; allow vertical scroll and keyboard-safe content. Reuse existing registration/identifier forms and token helpers.
- Identifier: preserve E-post/Mobilnummer radio group, labelled field, inline validation alert and disabled-until-valid Continue. After valid local input, proceed only through explicit OTP start; do not display the raw identifier in confirmation copy.
- OTP: title “Verifiera kontaktuppgift” / “Verify your contact detail”; explain “Ange den sexsiffriga koden om du har fått en.” / “Enter the six-digit code if you received one.” Render one labelled six-digit numeric field (JetBrains Mono, tabular, spaced visual groups; one logical input), Verify disabled until six digits.
- Pending start/verify: disable relevant action, expose polite live status “Vänta…” / “Please wait…”, prevent duplicate taps. No spinner-only status; no automatic retry.
- Wrong code: inline alert “Koden kunde inte verifieras. Kontrollera den och försök igen.” / “The code could not be verified. Check it and try again.” No remaining-attempt count or lock timer. Keep server-controlled limits opaque.
- Start/resend unavailable or ambiguous: generic alert “Det gick inte att fortsätta. Starta om verifieringen.” / “Could not continue. Restart verification.” Restart clears in-memory identifier/challenge/code/proof and returns to identifier entry with a fresh explicit start.
- Resend is explicit and gets a fresh action key. Disable for 30 seconds after accepted resend, show “Skicka en ny kod om {seconds} s” / “Request a new code in {seconds}s”; then “Skicka ny kod” / “Request a new code”. Never say sent, delivered, or give expiry/lock/account claims.
- Verified code: show restricted-step status, then mandatory BankID card: “BankID krävs för att slutföra registreringen.” / “BankID is required to finish registration.” “BankID är inte tillgängligt här ännu.” / “BankID is not available here yet.” No enabled fake action, account success, login, profile or household destination.

## Accessibility and proposed keys
- Use visible persistent labels and matching `accessibilityLabel`; OTP hint says six digits, numeric keyboard, focus moves to code after start, returns to alert/action after errors. Announce pending politely and errors/unavailable with alert/live-region semantics; preserve a visible focus indicator and 48pt minimum action targets.
- Honor reduced motion: no animated aurora or required motion; static status updates. Maintain AA contrast using token pairs; error is text plus field border/icon, never color alone.
- Proposed `onboarding.registration`: `otpTitle`, `otpIntroduction`, `otpHint`, `verifyPending`, `wrongCode`, `requestCode`, `resendCountdown`, `restartRequired`, `bankIdRequired`, `bankIdUnavailable`; replace any accepted-contact/account-success implication with neutral “Koden har verifierats.” / “The code was verified.” only if needed.
- Proposed sv/en core copy: `otpTitle` “Verifiera kontaktuppgift” / “Verify your contact detail”; `otpIntroduction` “Ange den sexsiffriga koden om du har fått en.” / “Enter the six-digit code if you received one.”; `bankIdUnavailable` “BankID är inte tillgängligt här ännu.” / “BankID is not available here yet.”
- No claim here of real code delivery, successful registration, BankID availability, native-device readiness, or full UF-01 completion; desktop rendering remains UI evidence only.
