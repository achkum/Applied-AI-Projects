# App Store & Google Play Setup

## Apple Developer Program: your questions answered
- **Is it once per app?** No. **One membership covers unlimited apps.** It costs **USD 99 per year** (in SEK or EUR equivalent locally) and must be renewed yearly. If it lapses, your apps are removed from sale, and TestFlight stops working.
- **Individual vs Organisation**
  - *Individual:* enrol with your Apple Account and ID. The seller name shown on the App Store is your personal name. It is fastest (often same-day to 48 h).
  - *Organisation:* needs a legal entity (for example an aktiebolag), a **D-U-N-S number** (free, but can take days to weeks), and authority to bind the company. The seller name is the company. You can later **migrate** an individual account to an organisation.
  - **Recommendation:** individual now, for TestFlight showcase builds. Switch to an organisation before any public App Store release that handles real bank data. See the risk note below.
- **What you can do with it:** TestFlight (up to 10,000 external testers per app after beta review; internal testers are instant), App Store distribution, push notification keys (APNs), Sign in with Apple, associated domains (universal links, which need a domain), and more.
- **No Mac needed:** Expo EAS Build compiles and signs iOS apps in the cloud. EAS Submit uploads to App Store Connect.

### Steps
1. Make sure your Apple Account has two-factor authentication. Enrol at developer.apple.com/programs → "Enroll" (individual). Pay the fee.
2. In App Store Connect, create the app record: bundle id `se.subtrack.app` (the architect confirms this), SKU `subtrack-ios`, primary language Swedish, plus an English localisation.
3. Create an **App Store Connect API key** (Users and Access → Integrations) with the App Manager role. Store the `.p8` file, key id and issuer id **only** in `/opt/subtrack/secrets/` (the devops agent wires EAS Submit to it).
4. EAS handles certificates and provisioning profiles automatically (`eas credentials`).
5. For the TestFlight external beta: fill in the "Test Information" and provide a **demo account**. Use demo mode plus the BankID simulator; reviewers can't use Swedish BankID.

### ⚠️ Review risk
App Review guideline 5.1.1(ix) expects apps in highly regulated fields, such as banking and financial services, to be submitted by a legal entity rather than an individual.
Even as a read-only aggregator, SubTrack may be treated as such.
TestFlight *internal* testing avoids App Review entirely. External TestFlight and the public App Store may be rejected until you enrol as an organisation.
This is the main reason to form the company before a public launch.

## Google Play Console
- **Fee:** USD 25 **one-time**. One account covers unlimited apps.
- **Personal accounts** need identity verification. Newer personal accounts must run a **closed test with a minimum number of opted-in testers for a continuous period** (Google has used 12 testers for 14 days) before they can apply for production access. Check the current rule in Play Console when you enrol.
  - Internal testing (up to 100 testers) is available immediately and is enough for the showcase.
- **Organisation accounts** need a D-U-N-S number and are exempt from that closed-testing requirement.
- **Steps:**
  1. Go to play.google.com/console → create a developer account (Personal). Verify your identity. Pay USD 25.
  2. Create the app `SubTrack` (package `se.subtrack.app`).
  3. Create a **service account** key for EAS Submit and store it in `/opt/subtrack/secrets/`.
  4. Complete the Data safety form, content rating, and target audience. Provide the demo-mode credentials for review.

## Build & release pipeline (owned by devops-release)
| Profile (`eas.json`) | Distribution | Trigger |
|---|---|---|
| `development` | Dev client (simulator/emulator + your device) | On demand |
| `preview` | Internal: iOS ad-hoc/TestFlight internal, Android APK | Each milestone gate |
| `production` | TestFlight + Play internal track | Release PR merged (D-01) |

- EAS Update (OTA) is used for JS-only fixes between builds.
- Store submission beyond internal tracks requires founder approval (D-04).
