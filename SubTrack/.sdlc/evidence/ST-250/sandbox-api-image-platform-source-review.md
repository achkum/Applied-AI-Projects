# ST250 independent platform review: sandbox image preparation

2026-10-14. Bounded SOURCE HOLD for one runtime dependency declaration; workflow/launcher architecture acceptable subject to the repair below. No Docker, API heavy compilation, SQL, hosted dispatch, Git or VPS action executed by reviewer.

## Reviewed source

Workflow and build-api.sh byte hashes match the image author's final handoff. Manual exact-head checkout with credentials not persisted, contents:read, immutable action pins, private pinned Node22.18 image build, bounded logs/deadlines, actual Linux amd64 UID1000 readonly/no-network probe, exact dedicated main CMD/default failclosed stderr, two migration hash comparisons and actual imports are meaningful packaging checks. Captured container/image IDs and run labels constrain teardown, successful daemon list calls prove absence, and sanitized receipt is withheld/removed on cleanup uncertainty. No registry push, image tar publication or live activation.

## Concrete HOLD: contracts runtime zod custody

`packages/contracts/profile.ts` imports zod at runtime. The contracts package lists its existing pinned zod4.6.5 only as a devDependency. The reviewed Dockerfile runtime stage installs --prod --filter @subtrack/api..., and .dockerignore excludes all copied node_modules. API's own zod production dependency resides in apps/api/node_modules and does not provide a declared contract-local dependency to the real workspace package path. No runtime resolver override or symlink should hide this omission. Move exactly the existing contracts zod4.6.5 declaration to dependencies and update its lockfile importer, preserving version and all unrelated entries. Review that narrow source repair before GO. Actual image import probe remains required after source GO and should fail closed if packaging is still incomplete.

## Compiler-layout investigation

The actual tsconfig.build roots239 files, all within apps/api/src; rootDir/composite are unset. Read-only inspection of installed TypeScript shows getCommonSourceDirectory filters through sourceFileMayBeEmitted, which excludes sources marked external libraries. The cross-package contracts/identifiers.ts import resolves via node_modules with isExternalLibraryImport=true despite its real path under packages/contracts. Cross-package .ts imports alone therefore do not establish a nested emitted main path. No rootDir repair is justified from this evidence. Actual tsc build and required dist/sandbox/main.js existence checks in Dockerfile/workflow, followed by direct require in the actual image probe, remain required runtime packaging evidence; esbuild fixture layouts do not substitute.

This review qualifies preparation architecture, not persistent PostgreSQL/public TLS/Android/iOS installed behavior. No public activation.
Reviewed workflow SHA256: 2a294f62142326f397f852b478bab530e0e53d39175f993962db2f6814a797b5
Reviewed launcher SHA256: 52517f7e8c478b123e300c4559193978c310cbb365c0cfbc3dcba22a4ae02036

## Narrow repair authored under root instruction

The reviewer was subsequently assigned only the existing pinned zod4.6.5 dev-to-runtime declaration/importer move. This repair is authored source and requires root independent diff/source comparison and privacy recheck before the image HOLD is cleared; reviewer does not self-approve it. Exact block reversal at edit time proved every unrelated lock byte preserved. pnpm12.6.0 install --lockfile-only --frozen-lockfile --ignore-scripts passed all1960 supply-chain entries without installed-dependency mutation. No compile/Docker/SQL/Git occurred.

Contracts package SHA256: be7213c2a9f86c03ecc4403d8b0aaa0337a2e212fd18842f30ab3713103f10d3
Workspace lock SHA256: 546dbd9d7a74e6848d9b82f81c3f68768ccc8ef3f6c650cc601e90076e1b4656
