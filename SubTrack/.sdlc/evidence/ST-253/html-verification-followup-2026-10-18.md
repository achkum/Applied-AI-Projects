# ST-253 HTML verification follow-up — 2026-10-18

Status: source corrections locally checked; a successor installed run is still required. Android v6 delivered APK and the live backend remain unchanged during this work.

## Observed comparison and corrections

Compared actual RNWeb component captures with the approved HTML at360×752 in English/Swedish and light/dark. These browser component previews are not Android acceptance.

- Home: visible payer metadata now uses the real member name, retaining the full planned-payer description for accessibility/detail. Period toggle stays in its hero row. The overview month card uses the reference left-heading/right-metadata layout; redundant external arrows and the extra bottom date row are removed. The real picker retains previous/next navigation and exact selected date; legacy nonoverview month controls remain.
- Profile: current authenticated household name, owner name and returned Admin role replace the name-only header, using23px reference token. Only the sandbox profile route injects the existing owner-scoped household reader; production receives no sandbox transport. Logout/blur/generation fences hide late responses. This adds one read with existing fail-closed session semantics; a focused household read failure retires the sandbox session rather than silently hiding an authorization failure.
- Language: reference endonyms Svenska/English in both locales; persisted values/readbacks unchanged.
- Subscriptions: compact medium-weight, single-line names; full accessible identity/exact amount and full detail title retained.
- Household: remove zero-valued unknown-payer clutter while preserving actual unknown values; expose exact scoped payer distribution to screen readers.
- Insights/detail: reference semantic tints and singular overlap copy; no changes to exact Money arithmetic, historical evidence or owner/revision authority.
- Date picker: backdrop and accessibility escape dismiss the sheet without mutating its selected date. Existing hardware close/date selection remain.

## Native test collection correction

Signed v6 run39111679544 passed SETUP/BANK/MANAGE, then failed PAGES without a retained frame. Its exact failed action and resulting UI remain unknown; no speculative selector or app correction is claimed.

The runner now collects natural assertion failures in pages/visual/restart after all three fixture/mutation prerequisites pass. Each later suite enters its own tab. Interrupted/unknown executions still stop; any failure prevents accepted screenshots/receipt. Residual modals can affect later attempts, so stage outcomes are not automatically independent app defects. Restart explicitly enters Profile.

The screenshot foreground parser did not recognize Android14's topResumedActivity field. Official pinned API34 Task.dumpInner source was checked2026-10-18:
https://android.googlesource.com/platform/frameworks/base/+/android-14.0.0_r1/services/core/java/com/android/server/wm/Task.java
Decoded source SHA256:0c4858dd546e88f5ffe8fc8b905778fe1f444b8e40c0610b352898860a256878.
The exact documented field and legacy field are recognized, but there must be exactly one combined resumed record and one current focused window, both user0 and sandbox package. Mixed/duplicate/foreign-user records reject. This producer/consumer defect can withhold a valid frame; it does not identify the PAGES assertion failure. Existing owned-emulator/fresh-fixture/verified-APK/foreground-before+after/PNG/private-cleanup requirements remain. Withheld captures report fixed stage categories only; discarded buffers are zeroed.

The fixed814 reuse exception is unchanged. These new app changes require a new artifact source/version; a grandchild is not dispatched pretending to be814.

## Local verification

Full workspace collection ran all55 tasks even after a failure:54passed; the sole failure was TS2339 in an optional-props test type. All64mobile suites/741tests passed. The type-only correction then passed mobile tsc. After the final overview month layout correction, all18billing-screen tests and final scoped lint passed. DatePicker9tests pass, including nonmutating backdrop/escape dismissal. Runner15tests pass including prerequisite/interrupt/aggregate-failure and API34 contradictory/mixed-user rejection. Catalog parity and all declared8contrast pairs in2themes pass. Independent agent source reviews recorded no blocking privacy or failure-integrity finding.

Ignored local evidence: html-component-preview/{capture-results,calendar-results,private-calendar-results}.json and PNGs; html-household-audit/{before,after}-results.json and24PNGs; android-v7-workspace-collection-private.log, android-v7-types-current-private.log, android-v7-month-current-private.log, android-v7-runner-tests-private.log. No screenshots or logs are fabricated as native proof.

## Open reference features and qualification

Privacy, renewal/price/trial notification settings and Support are genuine missing feature sections. No working native routes/client adapters exist. Existing privacy endpoints are declared unavailable-default; the old controller's caller header is not a safe substitute for the authenticated sandbox/native session. The invitation-only development notification adapter does not implement renewal/price/trial scheduling. Do not add inert switches, invent delivered notifications, or claim full reference feature parity. These gaps and native visual/gesture/screen-reader/scaling acceptance remain open.

Final month-header preview refresh: before/after four-locale/theme-pair captures and actual picker Next→November/Previous→October/select20October interactions pass with zero browser errors. Evidence: html-component-preview/calendar-header-results.json and {before,after}-calendar-header-home-{en,sv}-{light,dark}.png. This week shows two full rows at360×752. Staged secret scan and diff check pass. No installed qualification is implied.

### Collected hosted and local follow-up findings

PR303/sourcefdd334f3 hosted quality, Compose, PostgreSQL, same-image, container and build-policy checks pass. Both native jobs stop in Locked dependencies and proof tools, before app compilation or UI: their existing iOS-driver test fixture omitted the ST_FINAL_TOOLING value introduced by PR301. A second static CI-selection test still demanded the older source-equals-tooling literal and required the new optional tooling input. Both fixtures now preserve all original required inputs and reject missing/mismatched tooling; focused7tests pass. These are test-consumer corrections, not disabled checks or an app failure diagnosis.

All41mobile script-test files were collected together:269tests,267pass and2fail. Both failures came from prepending Git's GNUtar on Windows, which interpreted the Expo template's absolute C: path as a remote location. Without a source change, selecting the native Windows tar reran the two affected files:4tests pass. All other267 outcomes remain retained; no arbitrary failure was ignored. Final fixture lint passes.

Direct inspection of the after-preview additionally exposed merged adjacent axis labels1819 (today18 plus selected19). The corrected axis preserves actual today and fixed weekly ticks while suppressing nearby labels; exact selected date remains in the header and all bar values/taps remain unchanged. Regression iterates every valid day in28/29/31day months and checks spacing/current-day visibility and foreign-month ticks. All19billing tests, mobile types and scoped lint pass. Fresh four-variant previews and actual calendar/detail interaction confirm the merged label is gone; evidence after-axis-home-* and axis-capture-results.json. This remains browser evidence, not installed proof.
