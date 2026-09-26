# Founder Communication Templates (Telegram)

Keep every message ≤ 1,200 characters and phone-readable. No secrets, PII, raw logs or stack traces.

## STATUS (daily 18:00, or on request with "status")
```
📊 SubTrack · <date> · Milestone <M#> (<x>% of stories done)
✅ Done: ST-101 Register OTP, ST-104 BankID simulator
🔨 Doing: ST-110 Invitations (Brage), D1 tokens (Aurora)
⛔ Blocked: ST-130 Tink adapter — needs Tink Console credentials (HUMAN_TODO #1)
❓ Decisions: 1 pending (D-02 SMS provider)
⚠️ Risks: VPS RAM at 82% during E2E
⏭ Next 24h: finish M1 invitations, start synthetic generator
```

## GATE
```
🚪 GATE <G-M1> ready for your review
Exit criteria: 9/9 ✅ (report: .sdlc/reports/gate-M1.md)
Demo: <staging URL + basic-auth hint, or video path>
Security: signed off by Heimdall, 0 High
Reply APPROVE or list changes.
```

## DECISION NEEDED / 🔁 LOOP
See DECISION_RULES §2 for the format.

## INCIDENT
```
🚨 INCIDENT <sev> <title>
Impact: <what's broken>
Action: <what agents are doing>
Need from you: <nothing | X>
```

## DONE (task or milestone completed and merged)
```
🎉 Merged ST-123 → subtrack/develop (commit abc1234). CI green, QA pass.
```
