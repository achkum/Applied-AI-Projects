# SDK54 integrated native checks and unsigned workflow trigger proposal

2026-10-14 author sandbox_delivery_audit, isolated checkout integrated head035a1b2 (reviewed SDK2f65c65 and main4f55fc1). No Git/remote/signing actions. Exclusive short local check slot released after actual checks.

Actual integrated mobile compiler initially failed only SandboxSession.tsx line19: React19 useRef requires initial argument. Its merged allowed path was explicitly authorized for this compatibility-only initializer. Changed `useRef<SandboxSessionCore>()` to `useRef<SandboxSessionCore | undefined>(undefined)`; no facade/authority/lifecycle/render behavior changed. Final source SHA256 **bfedf650415ecdbbda15769964028df62c040d1b76448f3cda3d8be5fb220178**. Git diff shows exactly one changed source line/file; no manifest/lock changes.

Actual full mobile TypeScript noemit PASS after fix. Actual affected Jest10 suites/163 tests PASS under installed Expo54/RN0.81.5/React19: sandboxRuntime, SandboxSessionCore, SandboxSession (including mounted provider/router boundaries), secureSandboxBundle, sandboxMobileApi, sandboxMobileProjections, SandboxEntry, NativePersonalScreen, NativeBillingMonthScreen and NativePersonalRenewalsScreen. Focused ESLint for the changed provider PASS. These checks exercise the integrated native client and Money-backed screen ports, not a signed binary or installed device/public backend acceptance.

The initial corepack/pnpm12 exec unexpectedly auto-reconciled the already-current workspace and ran postinstall before compiler execution. This was not an intentional dependency install; the inspected shim only invokes corepack. Subsequent checks used direct installed TypeScript/Jest/ESLint binaries. Actual Git verification confirms package and lock sources unchanged.

## Proposed exact unsigned workflow amendment (not yet implemented)

Existing new workflow is manual only, so pre-default-branch workflow_dispatch has verified404 availability on peer workflows. To obtain actual macOS compilation before merging this new workflow into default, add ordinary `pull_request` with types `[opened, synchronize, reopened, ready_for_review]` and these paths:

* `.github/workflows/subtrack-sandbox-build.yml`
* `SubTrack/tools/sandbox/build-ios.sh`
* `SubTrack/apps/mobile/**`
* `SubTrack/packages/**`
* `SubTrack/package.json`
* `SubTrack/pnpm-lock.yaml`
* `SubTrack/pnpm-workspace.yaml`
* `SubTrack/.npmrc`
* `SubTrack/tsconfig.base.json`

Retain manual dispatch. Pin checkout `ref: ${{ github.event.pull_request.head.sha || github.sha }}` and `persist-credentials: false`, recording only nonsecret exact source head in fixed build evidence if needed. Use ordinary pull_request, never pull_request_target. Keep contents:read, standard macos-15, explicit Xcode26.2, no signing secrets/environment credentials, no artifact/private-log upload, no store operation and disabled runtime. Existing build helper must continue refusing signing/upload modes. This precise workflow-only change needs separate source amendment review/freeze; no trigger was edited or dispatched by this author.

Actual macOS unsigned compilation can fail and remains a meaningful gate. A passing archive establishes toolchain compatibility only; Apple signing access, installable beta distribution and installed phone behavior remain separate unresolved acceptance work.
