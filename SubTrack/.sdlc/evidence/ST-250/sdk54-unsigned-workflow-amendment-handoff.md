# SDK54 unsigned workflow amendment handoff

2026-10-14 author sandbox_delivery_audit. Root explicitly froze and authorized the precise ordinary PR trigger/installer correction. Only `.github/workflows/subtrack-sandbox-build.yml` is amended in this stream; existing native-device proof workflow is untouched. No Git/hosted dispatch/native build/dependency install/signing/upload/remote actions performed.

Final workflow SHA256 **0459be37531291185a647e39ed62769b7dde6418914d62de119b30ec8d38fd5e** replaces its earlier SDK17 handoff hash. All other prior SDK17 source files retain their committed reviewed state. The separate integrated SandboxSession.tsx initializer remains as documented in sdk54-integrated-native-checks.md; no behavior change accompanies this workflow amendment.

Added ordinary pull_request types opened/synchronize/reopened/ready_for_review and exact nine mobile/shared/manifests/helper/workflow path selectors from the reviewed proposal. Manual dispatch remains. Checkout selects exact PR head SHA (manual fallback github.sha), with persist-credentials:false. No pull_request_target or secrets context is used. Existing contents:read, standard macos-15, Xcode26.2 unsigned build helper, runtime-disabled preparation and no artifact/private-log/store upload boundary remain.

Replaced obsolete Corepack launcher with explicit `npm install --global pnpm@12.6.0`, exact version assertion, then direct frozen `pnpm install`. This uses the same actual successful image installer approach root qualified; it does not claim this new macOS workflow has already run. Installer/compilation failures remain blocking.

Actual YAML2.9.1 parsing plus meaningful assertions PASS: exact event keys/types/nine paths, exact PR-head expression/nonpersisted checkout credentials, read-only permission, standard runner, exact three-line pinned direct installer, unsigned-archive final action, absence of target event/Corepack/secrets context/upload action/paid large runner. Initial bare require('yaml') failed because YAML is transitive rather than root-declared; actual installed pnpm package was resolved explicitly without installation. Scoped whitespace check PASS. No broad unchanged tests repeated.

Independent root/source amendment review is required before curation/push. An actual pull_request event after reviewed push is the expected pre-default-branch compilation trigger; it cannot be replaced by a claimed manual dispatch that404s before workflow registration. Actual archive success, signing access and installed iPhone acceptance remain distinct.
