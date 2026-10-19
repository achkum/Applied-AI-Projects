# ST-250 — First-beta native client source handoff

2026-10-14. Source author changed only the25 exact source/test/catalog paths below; the previously reviewed four build-config paths are unchanged. Independent source/platform/privacy review required before curation. No backend/contracts edits, Git mutation, remote operation, build/signing/distribution or production activation. Local heavy check slot released.

## Executable source behavior

Separate sandbox adapter implements the strict bootstrap/resume/refresh/logout/business wire, validated UUIDv4 entropy keys, exclusive sandbox credential headers, bodyless refresh, no-store/media/status/size/deadline/abort checks, typed closed lifecycle conflicts and sandbox JWT header/issuer/audience/session namespace checking. Client namespace checks are not cryptographic authentication; backend signature/current-authority checks remain required. Unsupported provider/detected/currency/visibility rows are rejected. Production API composition resolves the disabled runtime and cannot fetch.

Atomic secure bundle uses its own THIS_DEVICE_ONLY key/service, strict version/capability/session-or-null envelope and wrapped OS errors. Capability stays process-private; no UI/context/route/log exposure. Session core persists before active, resumes stored possession once on initialization without automatically bootstrapping, retires unknown mutation/refresh/readback authority without retry and retains capability-only storage for explicit resume. All storage writes and logout clearing share one serial queue; generation/abort fencing before/after async work prevents late write/response resurrection. Local-clear failure still attempts captured server revocation and blocks use with storage-error. No unknown commit or server logout result becomes acknowledged success.

Existing approved Personal, Billing Month and Renewals screens now accept immutable session/API/projection ports with current private dependencies as defaults. Complete mounted sandbox entry/profile/Just Me/Add/Edit/status/reread/logout works using injected sandbox authority. Month/renewals reuse canonical selectors and Money, enforce50 total rows, nonempty continuing pages and duplicate/cursor/abort checks. No new financial calculations, alternate mock screens or provider flow. Sandbox replaces all inactive private verify/register controls, hides unsupported bank/detection navigation and persistently labels simulated verification/fictional inputs bilingually. Notices are deduplicated in actual route composition.

Sandbox root never mounts private NativeSession/Enrollment providers. Route boundary checks initial and later pathname before rendering an unsupported Stack/screen subtree; private registration/OTP/BankID/web/tabs/bank/detection deep links repair to safe Personal entry. Presence of malformed reserved sandbox metadata still selects the isolated unavailable branch, never private fallback. Default absent variant preserves existing private provider/routes. Explicit native provider `available` defaults false and every production route uses that false default; injectable source tests are not public activation.

## Actual validation and limits

- API/store/session-core/projection focused Jest:69 tests PASS, enforced100% statements/branches/functions/lines,236/236 branches,331/331 statements,63/63 functions. Actual final coverage JSON contains all four owned policy files. Covers namespace/strict wire, OS failures, all asynchronous generation boundaries, queued write/logout races, explicit resume/refresh uncertainty, late abort/decode results and bounded canonical projections.
- Existing Personal suite:26 tests PASS including the new coherent mounted sandbox entry/profile/Just Me/Add/Edit/status/current-readback/logout flow. Existing private behavior assertions remain. The initial new test referenced a nonexistent Add key and was corrected to the actual existing Add subscription title; no product behavior changed to satisfy it.
- Existing Month/Renewals plus provider/Entry checks passed; final focused provider/Entry rerun:8 tests PASS including actual RootLayout never mounting private providers, initial/later unsupported-route pre-mount rejection and malformed-marker isolation. Earlier Month/Renewals source run passed both default behavior and new sandbox projection/inactive controls. No unchanged full-suite repetition.
- Full mobile `tsc --noEmit` PASS after backend owner repaired its contracts Object.hasOwn ES2020 compatibility issue without library widening. Scoped23 TS/TSX-file lint PASS. Exact sv/en catalog key parity PASS.
- Initial check invocation had zero tests because shared contracts could not resolve the already installed mobile Babel runtime. Scoped Jest `modulePaths=[mobile/node_modules]` resolves that existing workspace substrate; no mock contract, resolver source or dependency was added. Checks use the actual strict contract module. CI must preserve its established shared Babel resolution (or equivalent existing setup), not skip the new suites.
- Early CLI coverageThreshold object was not sufficient enforcement; the final check passes a serialized full Jest config containing the100% threshold and exits0 with all metrics100. No lower-threshold run is presented as enforcement.
- A getter rejection test initially used Babel-transformed object literal syntax; it now uses actual Object.defineProperty and verifies the getter is never invoked. Root provider mock initially omitted Stack.Screen and was corrected without suppressing React warnings. Final checks passed cleanly.

Coverage directories are local verification output only, not curated source. No actual HTTP backend, persistent PG, trusted public TLS, native binary, screenshot/visual acceptance or phone installation was performed here. This handoff means source-ready client integration with activation disabled. Next deliverable is independently reviewed composition plus real backend/client build/device qualification, not another UI design/proof-only ticket.

## Final two-file review correction

Independent platform/privacy review identified two real Core races after the initial handoff. Both are fixed only in SandboxSessionCore.ts and its test; the other23 source hashes and prior reviews/checks remain unchanged.

First, a separate revocation-only credential slot survives refresh and authority retirement. Every known bootstrap/resume/refresh result assigns it only after the generation check and before pending secure persistence. Business run/refresh never reads this slot. Logout captures and consumes it synchronously, so a busy refresh response uses the prior known access credential and a pending write uses the newly known credential, with exactly one best-effort server revocation even if local clearing fails. A late post-logout result cannot recreate that slot or business authority.

Second, a process storage-failure latch is independent of stale intent generations. Failed reads/writes/clearing retire capability and business credentials and publish storage-error; every queued authority operation checks this latch before storage/network work. A bootstrap or initialize queued while logout clearing is pending cannot hide a failed clear by changing generation. Resume remains blocked. Only a known successful explicit local secure deletion resets this latch; dispose/reinitialize alone cannot reset it. Captured server revocation still runs after failed local deletion.

Actual affected Core check:40 meaningful tests PASS with enforced100% coverage,86/86 branches,198/198 statements,25/25 functions, all lines covered. Includes pending refresh response/write with successful/failed clearing, generation-fenced revocation custody, queued bootstrap/resume/initialize after deferred clear failure and explicit safe recovery. Full mobile types and two-file lint PASS. Initial coverage showed now-unreachable legacy storage-error ternaries after the new latch; they were simplified because real OS failures already throw through the latched path, not suppressed/ignored. No unchanged suite repeated. Heavy slot released; independent narrow source re-review remains required before curation.

## Final canonical problem-envelope compatibility correction

Independent cross-component inspection found that the native conflict reader expected the private graph's title `Conflict`, while the completed sandbox contract/server use `Sandbox request unavailable`. After conductor authorization, only sandboxMobileApi.ts and its test now consume the actual strict `parseSandboxProblem` contract. Typed conflict handling is limited to the three already accepted manual-edit/lifecycle codes at status409; old/private title, malformed/extra fields, mismatched body status or unrelated restart codes fail unavailable without retry. Known server-shaped conflict remains usable for current readback inside the serialized screen action; no credential authority or runtime gate changed.

Actual affected adapter check:22 tests PASS, enforced100% across107 branches/105 statements/30 functions/all lines. Full mobile types and two-file lint PASS. No unchanged suite repeated. The current roster includes four corrected files (Core/test and API/test); other21 original source hashes remain unchanged. Narrow independent source re-review is required before curation.

## Exact current SHA256 roster

```text
apps/mobile/src/api/sandboxMobileApi.ts 206af5072bafd7b10af876669cb5dcce58d429c4e0c373bf655f0f65e58397fe
apps/mobile/src/api/sandboxMobileApi.test.ts e402dacfc53d292ff043964edf606cdce077f382f8b05955b349183c92272e23
apps/mobile/src/api/sandboxMobileProjections.ts 7e4c346148a6b541c35fd077b689968f2054f62885464066d4312b5effe9052d
apps/mobile/src/api/sandboxMobileProjections.test.ts 5f61e41a73744e5c87a21dce58577cc4f202da130bfc15dabf9e39b270f6c7c3
apps/mobile/src/utils/secureSandboxBundle.ts f6f53b76300364bc8de04edff223ddc1ee77ad68fb370429db026bbb71569daa
apps/mobile/src/utils/secureSandboxBundle.test.ts 7292f42af18dcd8e9a9fc165aeb6845fc10816c6e9fd36bae4a312642205ff05
apps/mobile/src/state/SandboxSessionCore.ts 85acd8109afb472b0101c074d7aeb5ba87da2dc1dad35423546ccc24d7d48ef3
apps/mobile/src/state/SandboxSessionCore.test.ts e5b38b6f888c58265ce30d06fc9cb931602643a74af0fce4ce11a7712c530892
apps/mobile/src/state/SandboxSession.tsx 608bd1aef6fd0ee8cfb43b17e7d65532b1eeaafea3cbab09d7ef59de898b9c22
apps/mobile/src/state/SandboxSession.test.tsx 1142272476cb469f648574529e55849c6cda5e92bf9e274012fb5b3b4bc79888
apps/mobile/src/components/onboarding/SandboxEntry.tsx 9556a9181fc574e42669631d696adec170cfb8b3f06796e76896bcd7eec54d0d
apps/mobile/src/components/onboarding/SandboxEntry.test.tsx c40c93dab1f945144906a40e91cce0d54760a7235bab45226aa4de2da170878f
apps/mobile/src/components/onboarding/NativePersonalScreen.tsx a80216085be441d002251e0d4520e61f2ed06afecaeb74579bc0117801049521
apps/mobile/src/components/onboarding/NativePersonalScreen.test.tsx a35fabfe8ec17b6425dd8815974c51ec2110e554fa8ed6749f86f3159d539073
apps/mobile/src/components/billing/NativeBillingMonthScreen.tsx 629762754fb2c232fe742c3c4bf1b79f8d9668721494cbc33a44ca11d749b341
apps/mobile/src/components/billing/NativeBillingMonthScreen.test.tsx b09898b6cdeb8eca74271a9617582fc07f89a789215d7be4b0329e5ca60ee628
apps/mobile/src/components/home/NativePersonalRenewalsScreen.tsx 309d4bd89b877bd132ab9d2232d980b3e050e3605e13a23223031403aff13496
apps/mobile/src/components/home/NativePersonalRenewalsScreen.test.tsx 1f89ffd672f8e227059d6044e3706a13e291e5ed90aa62398182f10e742c7132
apps/mobile/app/_layout.tsx 95c4f86f75ad96c401ee4f5137c0bf8ba44cc8bc1c2b9f7619606d321693460b
apps/mobile/app/index.tsx f3b49ffa02138ad0f9fbabe7a8b5910f8160c58d886704f3780b817c398bdf8f
apps/mobile/app/personal.tsx d036c0560f22fb08876eac316ffdfea6435525f9499fb93f3c4b431d0e4869d3
apps/mobile/app/personal-home.tsx 43e1cbe79e2d31948c28a2e0e89613a0755027e14d5e8bffeb82942a283d2483
apps/mobile/app/personal-billing-month.tsx 724f21f18a985fe0b8da426ba2937be9ae4cb60252b070d28b770372d33139d6
packages/i18n/catalogs/en.json 2200149c2905229f7ecfc8b724d2204f0a3940afb778d777220e75ae9428d4fe
packages/i18n/catalogs/sv.json 75909883de5e0e3016e76970fc6d5231fb763e619899e01fe4ce14aadde3ab39
```
