# Enabled iPhone archive preparation — 2026-10-19

Actual source `dd0cd85496883fa442118547a12a31cb4d9802f9` passed run39207922160/job117914699179. The observed final line is:

```text
ST250_IOS_UNSIGNED_ARCHIVE_PASS Xcode=26.2 signing=unavailable upload=not-performed runtime_intent=enabled runtime_qualification=not-performed build_number=7 installable_ipa=false
```

This is a real Release archive compilation and actual payload verification, not an installed-phone result. The verifier checked actual device-platform Info.plist identity/build number, public sandbox config/runtime/origin/private exclusions, Hermes bytecode and ARM64 executable before emitting the pass. Invocation Git HEAD is bound to the measured payload; no embedded source field is invented. The archive was not uploaded or exported as an IPA.

The workflow previously omitted runtime/version inputs and therefore defaulted to a disabled archive. Explicit activation now requires a canonical bounded build number; default remains disabled. Eleven focused intent/payload/workflow cases, scoped lint, Bash syntax and independent source/privacy review passed before this one enabled archive build.

Pinned Expo18.0.14 evidence: scripts/get-app-config-ios.sh names EXConstants.bundle and directs its resource output there. scripts/build/getAppConfig.js obtains the public Expo config and writes app.config with JSON.stringify(exp). Verification consequently reads the actual EXConstants.bundle/app.config and preserves its canonical bytes, without treating source metadata as runtime evidence.

The existing hosted installed-iOS hierarchy driver timed out before compilation in run39204120861/job117903210771. That failure remains failed/unqualified. No additional driver-only diagnostic, retry or timeout extension was launched. This archive follows the separate actual-device build path; it does not establish simulator reachability, VoiceOver or exact whole-app HTML parity.

The founder has an existing Apple Developer membership but no app/signing configuration and no Mac. Apple Developer was opened for the founder's own login; signing setup now needs that authenticated session. No Apple credentials, signing identity, provisioning profile, new account, purchase, legal acceptance, store/public release or TestFlight upload has been performed.

CI follow-up: three exact archive-only script paths are excluded from installed-native PR triggers, while the Linux archive policy still checks them. Actual YAML tests cover ordered path rules, all six archive-only paths, mixed app/API/config/lock changes, neighboring unknown scripts and workflow self-changes. Fourteen focused cases and scoped lint/diff checks pass. Existing selector, full/default/manual device qualification and workflow self-qualification remain unchanged. The integration branch is unprotected and its applicable repository rules API returned an empty list; no settings were modified.

Ordered path-filter semantics: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore . Negative patterns follow the positive mobile glob; any remaining included path still launches the existing native workflow. No manual shortcut or app acceptance is inferred from an archive-only policy result.
