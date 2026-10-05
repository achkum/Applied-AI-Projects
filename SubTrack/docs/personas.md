# SubTrack Demo Personas

Five deterministic showcase households defined in `packages/synthetic/src/personas.ts`. Used for:
- ML classifier evaluation (`ST-080` detection harness)
- Integration tests via `SyntheticBankProvider`
- Demo tenant data via `services/demo-seed`
- App store screenshots and reviewer flows

All amounts are in **SEK öre** (minor units). 100 öre = 1 SEK.

---

## Household 1 — Emma Solberg

**Profile:** Single professional, one bank account, four personal subscriptions.  
**Persona seed:** `persona:household-solberg`

| # | Subscription | Category | Billing | Amount (öre) | Amount (SEK) | Owner |
|---|---|---|---|---|---|---|
| 1 | Netflix | `video-streaming` | MONTHLY | 14 900 | 149 kr | ME |
| 2 | Spotify | `music-audio` | MONTHLY | 10 900 | 109 kr | ME |
| 3 | iCloud | `cloud-storage` | MONTHLY | 3 900 | 39 kr | ME |
| 4 | LinkedIn Premium | `software-productivity` | **ANNUAL** | 89 900 | 899 kr/yr | ME |

**Monthly cost (approx):** 149 + 109 + 39 + 75 = **~372 SEK/month**

**Bank descriptor variants:**
- Netflix: `NETFLIX`, `Netflix`, `NETFLIX*`, `NETFLIX.COM`
- Spotify: `SPOTIFY`, `Spotify`, `SPOTIFY AB`, `SPOTIFY NORDIC`
- iCloud: `APPLE.COM/BILL`, `ICLOUD`, `APPLE ICLOUD`, `APPLE.COM`
- LinkedIn: `LINKEDIN`, `LINKEDIN PREMIUM`, `LINKEDIN.COM`, `LINKEDIN DIGITAL`

---

## Household 2 — Lars & Maria Lindqvist

**Profile:** Couple, two members sharing six household subscriptions.  
**Persona seed:** `persona:household-lindqvist`

| # | Subscription | Category | Billing | Amount (öre) | Amount (SEK) | Owner |
|---|---|---|---|---|---|---|
| 1 | Disney+ | `video-streaming` | MONTHLY | 13 900 | 139 kr | HOUSEHOLD |
| 2 | YouTube Premium | `video-streaming` | MONTHLY | 21 900 | 219 kr | HOUSEHOLD |
| 3 | Spotify Duo | `music-audio` | MONTHLY | 15 900 | 159 kr | HOUSEHOLD |
| 4 | Storytel | `books-media` | MONTHLY | 17 900 | 179 kr | HOUSEHOLD |
| 5 | Microsoft 365 Family | `software-productivity` | **ANNUAL** | 119 900 | 1 199 kr/yr | HOUSEHOLD |
| 6 | iCloud 2TB | `cloud-storage` | MONTHLY | 9 900 | 99 kr | HOUSEHOLD |

**Monthly cost (approx):** 139 + 219 + 159 + 179 + 100 + 99 = **~895 SEK/month**

**Bank descriptor variants:**
- Disney+: `DISNEY+`, `DISNEY PLUS`, `DISNEYPLUS.COM`, `DISNEY DIGITAL`
- YouTube Premium: `GOOGLE YOUTUBE`, `YOUTUBE PREMIUM`, `YOUTUBE.COM`, `GOOGLE*YOUTUBE`
- Spotify Duo: `SPOTIFY`, `SPOTIFY AB`, `SPOTIFY NORDIC`, `SPOTIFY DUO`
- Storytel: `STORYTEL`, `STORYTEL AB`, `STORYTEL.COM`, `STORYTEL SWEDEN`
- Microsoft 365: `MICROSOFT*365`, `MICROSOFT 365`, `MICROSOFT.COM`, `MSFT*OFFICE365`
- iCloud 2TB: `APPLE.COM/BILL`, `ICLOUD 2TB`, `APPLE ICLOUD`, `APPLE.COM`

---

## Household 3 — Ahmadi Family

**Profile:** Family of four — Karim, Sara, and two teenage children. Mix of HOUSEHOLD and MEMBER ownership types (demonstrates per-member privacy model).  
**Persona seed:** `persona:household-ahmadi`

| # | Subscription | Category | Billing | Amount (öre) | Amount (SEK) | Owner |
|---|---|---|---|---|---|---|
| 1 | Netflix | `video-streaming` | MONTHLY | 18 900 | 189 kr | HOUSEHOLD |
| 2 | Spotify Family | `music-audio` | MONTHLY | 19 900 | 199 kr | HOUSEHOLD |
| 3 | Max | `video-streaming` | MONTHLY | 12 900 | 129 kr | HOUSEHOLD |
| 4 | Adobe Creative Cloud | `software-productivity` | MONTHLY | 67 900 | 679 kr | MEMBER (Karim) |
| 5 | YouTube Premium | `video-streaming` | MONTHLY | 11 900 | 119 kr | MEMBER (Sara) |
| 6 | Duolingo Plus | `education` | **ANNUAL** | 8 900 | 89 kr/yr | MEMBER (Sara) |
| 7 | Headspace | `health-wellness` | **ANNUAL** | 9 900 | 99 kr/yr | MEMBER (Karim) |
| 8 | Apple One | `bundle` | MONTHLY | 34 900 | 349 kr | HOUSEHOLD |

**Monthly cost (approx):** 189 + 199 + 129 + 679 + 119 + 7 + 8 + 349 = **~1 679 SEK/month**

**Bank descriptor variants:**
- Netflix: `NETFLIX`, `NETFLIX*`, `NETFLIX.COM`, `NETFLIX DIGITAL`
- Spotify Family: `SPOTIFY`, `SPOTIFY AB`, `SPOTIFY FAMILY`, `SPOTIFY.COM`
- Max: `MAX.COM`, `HBO MAX`, `MAX STREAMING`, `WARNERMEDIA*MAX`
- Adobe CC: `ADOBE SYSTEMS`, `ADOBE*CREATIVE`, `ADOBE.COM`, `ADOBE CREATIVE`
- YouTube: `GOOGLE YOUTUBE`, `YOUTUBE PREMIUM`, `YOUTUBE.COM`, `GOOGLE*YOUTUBE`
- Duolingo: `DUOLINGO`, `DUOLINGO*PLUS`, `DUOLINGO.COM`, `DUOLINGO DIGITAL`
- Headspace: `HEADSPACE`, `HEADSPACE.COM`, `HEADSPACE ONLINE`, `HEADSPACE DIGITAL`
- Apple One: `APPLE.COM/BILL`, `APPLE ONE`, `APPLE ONE FAMILY`, `APPLE*ONE`

---

## Household 4 — Jakob Eriksson

**Profile:** Student on a tight budget — three subscriptions, all personal.  
**Persona seed:** `persona:household-eriksson`

| # | Subscription | Category | Billing | Amount (öre) | Amount (SEK) | Owner |
|---|---|---|---|---|---|---|
| 1 | Spotify Student | `music-audio` | MONTHLY | 5 900 | 59 kr | ME |
| 2 | Netflix | `video-streaming` | MONTHLY | 14 900 | 149 kr | ME |
| 3 | GitHub Copilot | `software-productivity` | MONTHLY | 11 900 | 119 kr | ME |

**Monthly cost:** 59 + 149 + 119 = **327 SEK/month**

**Bank descriptor variants:**
- Spotify Student: `SPOTIFY`, `SPOTIFY AB`, `SPOTIFY STUDENT`, `SPOTIFY NORDIC`
- Netflix: `NETFLIX`, `NETFLIX*`, `NETFLIX.COM`, `NETFLIX SE`
- GitHub Copilot: `GITHUB`, `GITHUB.COM`, `GITHUB COPILOT`, `GITHUB*COPILOT`

---

## Household 5 — Adaeze Okonkwo

**Profile:** Freelance designer — five productivity-heavy professional tools.  
**Persona seed:** `persona:household-okonkwo`

| # | Subscription | Category | Billing | Amount (öre) | Amount (SEK) | Owner |
|---|---|---|---|---|---|---|
| 1 | Adobe Creative Cloud | `software-productivity` | MONTHLY | 67 900 | 679 kr | ME |
| 2 | Figma | `software-productivity` | MONTHLY | 19 000 | 190 kr | ME |
| 3 | Notion | `software-productivity` | MONTHLY | 11 900 | 119 kr | ME |
| 4 | Slack | `software-productivity` | MONTHLY | 31 900 | 319 kr | ME |
| 5 | Vercel | `cloud-infrastructure` | MONTHLY | 23 900 | 239 kr | ME |

**Monthly cost:** 679 + 190 + 119 + 319 + 239 = **1 546 SEK/month**

**Bank descriptor variants:**
- Adobe CC: `ADOBE SYSTEMS`, `ADOBE*CREATIVE`, `ADOBE.COM`, `ADOBE CREATIVE`
- Figma: `FIGMA`, `FIGMA.COM`, `FIGMA ONLINE`, `FIGMA*PRO`
- Notion: `NOTION`, `NOTION.SO`, `NOTION ONLINE`, `NOTION*PLUS`
- Slack: `SLACK`, `SLACK.COM`, `SLACK TECHNOLOGIES`, `SLACK*PRO`
- Vercel: `VERCEL`, `VERCEL.COM`, `VERCEL INC`, `VERCEL*PRO`

---

## Summary

| Persona | Members | Subs | Monthly (SEK) | Key characteristic |
|---|---|---|---|---|
| Emma Solberg | 1 | 4 | ~372 | Single professional; LinkedIn annual |
| Lars & Maria Lindqvist | 2 | 6 | ~895 | Couple; all HOUSEHOLD owned |
| Ahmadi Family | 4 | 8 | ~1 679 | Mixed HOUSEHOLD + MEMBER ownership |
| Jakob Eriksson | 1 | 3 | 327 | Student; minimal spend |
| Adaeze Okonkwo | 1 | 5 | 1 546 | Freelancer; all productivity tools |

---

## How personas are used in tests

```typescript
import { ALL_PERSONAS, SyntheticBankProvider } from '@subtrack/synthetic';

const provider = new SyntheticBankProvider();
const accounts = await provider.getAccounts('household-solberg');
const txns = await provider.getTransactions(
  accounts[0].id,
  new Date('2025-09-01'),
  new Date('2026-10-01')
);
// txns → deterministic list of 4 × ~13 = ~52 transactions
```

The same call always returns the same transactions regardless of when or where it runs.
