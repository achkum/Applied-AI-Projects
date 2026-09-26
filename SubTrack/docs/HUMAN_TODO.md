# HUMAN TODO: things only the founder can do

The Conductor tracks these and reports the status in each STATUS message. Nothing here blocks M0.

| # | Item | Why | Blocks | Est. time | Cost |
|---|---|---|---|---|---|
| 1 | **Create a Tink Console account** and a sandbox app. Put the client id and secret in the VPS secrets file (never in chat). Add the redirect URI the architect gives you. | Agents can't create accounts in your name (D-03). | ST-061, ST-066 | 20 min | Free (sandbox) |
| 2 | **BankID test setup:** get a test BankID from demo.bankid.com on a spare phone (or a test-configured BankID app). | Needed to exercise `test` mode end-to-end. Simulator mode works without it. | ST-043 verification | 30 min | Free |
| 3 | **Apple Developer Program** enrolment (see ops/APP_STORES.md). | TestFlight/App Store | ST-166 (iOS) | 1–2 days (Apple review) | USD 99/year |
| 4 | **Google Play Console** developer account (see ops/APP_STORES.md). | Play internal testing | ST-166 (Android) | 1–3 days (identity verification) | USD 25 one-time |
| 5 | **Expo account** (free) for EAS builds. Create an access token and store it on the VPS as `EXPO_TOKEN`. | Cloud builds for iOS/Android | ST-009 onward (preview builds) | 10 min | Free tier |
| 6 | **Free LLM keys:** Google AI Studio (Gemini) and/or Groq; optionally OpenRouter. | Showcase AI features | ST-120 | 15 min | Free tiers |
| 7 | **Transactional email** (e.g. a free-tier SMTP provider) for email OTP beyond Mailpit. | Real email OTP on staging | ST-041 on staging | 20 min | Free tier |
| 8 | **Telegram:** confirm OpenClaw's bot is bound only to your user id (allowlist). | Governance channel | Kickoff | 5 min | Free |
| 9 | **GitHub:** give the VPS a deploy key or fine-grained PAT with push access to `achkum/Applied-AI-Projects` **only**. Add branch protection on `main` (require PR, no force-push). | Safe agent pushes | ST-001 | 15 min | Free |
| 10 | **Decide on a domain** (optional now). It unlocks iOS universal links, Android App Links, a cleaner Tink redirect, and email sender reputation. | R1, R3 | Nice-to-have | 10 min | ~100–200 SEK/year |
| 11 | **Review ASSUMPTIONS.md**, especially A11 (model routing). | Binding after 48 h | – | 15 min | – |

## Secrets file convention (VPS)
`/opt/subtrack/secrets/staging.env` is owned by root, mode 600, and mounted by Compose. Agents may read `.env.example` **only**.
To add a secret, run `sudo nano /opt/subtrack/secrets/staging.env`, then tell the Conductor "secret X added". Never paste the value in Telegram.
