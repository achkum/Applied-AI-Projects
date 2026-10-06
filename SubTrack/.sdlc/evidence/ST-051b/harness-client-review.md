# ST051b harness correction client review

## Verdict

**Approve the harness correction for review; cold full-mobile QA is still pending.** The change addresses the diagnosed RNTL first-use cost at file setup, before the application startup test starts its clock. Its fixture is isolated from `RootLayout`, and it is unmounted before app assertions run. The existing 15-second first-startup deadline and assertions remain intact.

## Coverage and timing

The first `RootLayout` test still renders the real `RootLayout` with the test's configured font and storage mocks, checks splash prevention, router mount, provider state, both preference reads, and splash hiding. The later tests still cover pending fonts, the loaded rerender path, font-error system aliases, and a rejected splash-hide promise. The prewarm therefore does not replace or bypass the application behavior under review.

The prewarm's native `View`/`Text` render and `getByTestId` query are consistent with the diagnosis that RNTL lazily detects host components on first query. Its 60-second `beforeAll` budget is isolated to harness preparation. Timing output separates this preparation from the existing startup assertion duration. The logs contain only elapsed timings and test phase labels, with no application data or secrets.

## QA status and limits

No tests or Git commands were run for this review. The required cold full-mobile run (`72998`) was reported as underway; its result was not available in the reviewed material. Passing local cold-cache tests would not establish CI stability. Review the measured prewarm and app-startup durations and the unchanged-deadline result from that run. A passing run with a material prewarm cost supports the diagnosis, but the diagnosis note calls for a fresh cold CI repeat to establish stability. If startup still times out or prewarm does not show meaningful one-time work, the correction is not validated and the next investigation should time the app startup phases as specified in the diagnosis.
