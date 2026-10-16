# Android Save continuation — 2026-10-16

One agent, existing checkout; no subagents, automation, iOS/web execution or release operations.

Prior run38927710444/job117063406161 reaches the Save tap then fails the SAVED_HEADER upward scroll. Its existing local completed log contains no failed_save_manual or failed_save_count lines. Source shows failedSaveObservations accepts only the later legacy subscription-saved/wait-visible/assertion diagnostic; current legacy diagnostic is withheld. Thus neither a successful create nor a backend failure was observed.

Diagnostic source52851f14 enables the existing bounded observer/readback/feedback probes for the exact owned structured Android SAVED_HEADER failure. It does not change the app, acceptance flow, single Save tap, timeouts, screenshot eligibility, session or backend behavior. Extra/malformed/foreign metadata is rejected. Existing iOS behavior remains unchanged.

Focused validation: 10 tests PASS; save-probe helper 100% lines/branches/functions. Driver syntax and scoped three-script ESLint PASS. Workflow YAML parses; Android dispatch matrix and retained two-platform PR matrix verified. Delta gitleaks8.24.3 scan4bf8acb..52851f14: one commit, no leaks.

Android-only run38943568439/job117116950992 on52851f14 completed: Save arrivals=one, finished201=one; rejected4xx/failed5xx/other/incomplete=zero before and after observations. Durable subscription count=one. SAVED_HEADER persists. All eleven fixed feedback probes and header scroll time out; they are inconclusive and do not establish absence, navigation or actual rendered pixels. No failed screenshot capture authority was widened.

The first nonempty Manage list calls formatMinorUnits with BigInt through Intl.formatToParts. Exact pinned Hermes e0fc67142ec0763c6b6153ca2bf96df815539782 Intl.cpp1265-1272 rejects that input (https://github.com/facebook/hermes/blob/e0fc67142ec0763c6b6153ca2bf96df815539782/lib/VM/JSLib/Intl.cpp#L1265, inspected2026-10-16). A regression shim reproduces the failure at formatter.ts96 before repair. This source-proven render defect is consistent with successful creation followed by the failed UI; actual exception/pixels were not captured.

Candidate formatter repair uses only fixed +/-1 and1000 Intl metadata samples and exact bigint/string monetary digits for the existing sv/en locales. Public API and currency/sign/fraction/group semantics preserved. All162 money tests PASS with100% statements/branches/functions/lines; money types and source lint PASS. Root ESLint on the test file reports the pre-existing boundaries/external vitest import policy; the original import is unchanged and no rule waived. Package-prescribed source lint passes.

ETA supplied after observation:90-150minutes conditional on next installed run passing and required review availability; independent review completion remains uncertain. No successor build/signing/publication started; live V2 is unchanged. Independent final review and applicable integration/delivery gates remain blocking before delivery. No self-approval.


## Installed setup visual evidence
The original fixed screenshot roster omitted welcome/signup/profile. Added Android welcome/signup captures before input and a profile capture after the existing visible profile-title assertion. Separate Android-only setup roster is required/copied only after the original complete durable acceptance; raw failed screenshots remain excluded and iOS acceptance roster unchanged. Seven edit-status/evidence tests PASS at100%helpercoverage;20 affected identifier consumer tests PASS. Original sourceguard still asserts exact navigation/action sequence after stripping only the known signup screenshot command. Save-probe10 and metadata38 tests in the combined affected consumer run passed; its one identifier screenshot-source expectation was corrected and independently rerun. Scoped scripts lint/driver syntax pass. No product behavior changed beyond the formatter repair.

Superseded run38946375949 was cancelled to include required visual checkpoints in the next candidate. Closed log shows native-build started at18:22:48UTC before cancellation completed; the intended precompile cancellation did not succeed. No completed APK/test result was published.

Run38947008073 failed before emulator/build on the exact Android/iOS flow-equality consumer, which had not been included in the first local consumer selection. The test now derives the expected Android flow by adding only the two fixed screenshots to the unchanged original action sequence; full equality/freshness/order checks retained. Remaining flow-policy/renewal/month consumers15PASS; policy lintPASS. All five direct consumers were inventoried: save-probe, edit-status, flow-policy, identifier-probe and maestro-metadata; their affected checks now pass. No app compilation ran in this failed attempt.
