# ST-051b font startup evidence

Bundled Manrope/Fraunces fonts load before providers render and splash hides; failures continue using platform system font aliases without changing preference storage or generated theme data. A public token export replaces a private path previously hidden by a virtual Jest mock. Expo SDK 51 pnpm asset registry resolution and opt-in web workspace serving are corrected; invalid optional favicon reference removed.

The five focused tests, scoped ESLint, mobile TypeScript, frozen offline install, actual iOS/Android Hermes exports, byte comparisons, and four-state actual Expo browser check passed. Coverage applies only to RootLayout and RootProvider. Reviews approved the slice. Required exact-head CI remains pending until PR acceptance.

No native device, screen reader, native splash appearance, binary release, or complete onboarding claim. Existing native icon/splash asset references and mono font registration remain outside this task. Parent ST-051 is incomplete.

Font and license files are exact copies of the accepted web assets. Source hashes below bind the reviewed source; browser/native evidence is separate from device acceptance. Author staging had schema assumptions corrected by root; original startup/provider integration coverage preserved. Manual call counters and budget exceptions are disclosed in qa-receipt.json; no automatic context clearing or token savings are claimed.

Expo sources: https://docs.expo.dev/versions/v51.0.0/sdk/font/ and https://docs.expo.dev/versions/v51.0.0/sdk/splash-screen/ (documentation fetch attempted 2026-10-06; network proxy returned403). Verified against installed official expo-font12.0.10 FontHooks.d.ts and Expo51 Metro configuration implementation. No external provider integration.

Initial CI failed one startup test deadline among81cases. The final corrected test removes its timer and flushes promises after synchronousrender; mobile Jest workers capped2. All16suites81cases pass locally; focused startup5tests preserve100percentcoverage. Exact-headCIrerunpending.

SecondCI repeated first coldmount5secondtimeout. MatchexistingRootIndex15second firstmountallowance only; allassertionsandtheirfind/waitfordeadlines retained. Independentclientreviewapproves. Coldno-cachefullsuite16suites81testsPASS13.606seconds. ThirdexactheadCIpending.
