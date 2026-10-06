# ST-172 final platform review

## Verdict

**PASS for the scoped Jest and Expo Web/Metro resolution changes.** The reviewed resolver code honors both package public roots and preserves default resolution elsewhere. The captured Expo Web browser QA artifact shows 10 states with no browser errors or horizontal overflow: English and Swedish, light and dark themes at 375 px and 320 px, plus each locale's unsupported BigInt scenario with all amounts hidden. All six subscription rows render with their original monthly/annual cadence in the supported scenarios. This is web evidence only.

**Native execution remains a merge/adoption blocker.** No native device/simulator Hermes execution was reviewed or claimed here. ST-172 requires that evidence before merge/adoption of the mobile caller.

## Reviewed files and hashes

SHA-256 hashes bind this review to the following exact config contents:

- `apps/mobile/jest.config.js`: `d0b1cef18bee24720df5a522874e67fbce0813002e3db9b254c4b6e3a078abfb`
- `apps/mobile/jest.workspace-resolver.cjs`: `aa0e7605fd7fddc61f153dab106bb0bc5983851e0bee2cf86c3af9da98461d83`
- `apps/mobile/metro.config.js`: `76bd5d8a7d5dd1d8b89735dd3d6c26f235ef4e10d28ea0fa16c746049a49e5ec`

The Jest resolver adds the `import` export condition only for exact `@subtrack/money` and `@subtrack/synthetic` root requests, retaining the existing Jest conditions. It resolves those requests through the package export maps. For all other requests it delegates to the default resolver first; its `.js` to `.ts` retry is limited to relative requests originating inside either package's source directory.

The Metro wrapper likewise delegates every request to `context.resolveRequest` first. Only a failed relative `.js` request originating in `packages/money/src` or `packages/synthetic/src` is retried with `.ts`; failed retries rethrow the original error. Metro package exports remain enabled, and no package-root or private-source alias was introduced. This is the minimal production compatibility behavior needed for the ESM `.js` specifiers in the TypeScript workspace sources.

## Evidence and version references

- Focused Jest QA: root reported 13 focused tests passing with this scoped resolver.
- Expo Web QA: `/workspace/.setup/ST172-browser-qa.json` records the 10 browser states described above. Root reported the Expo Web/Metro bundle passed with the scoped fallback.
- Runtime versions recorded during review: Expo `51.0.39`, Metro and metro-resolver `0.80.12`, Jest and jest-resolve `29.7.0`, jest-expo `51.0.4`.
- The installed Metro `CustomResolver` contract was checked in the Metro 0.80.12 `metro-resolver/src/types.js.flow` and `resolve.js.flow`: it exposes `originModulePath` and delegates through `context.resolveRequest`.
- The installed Jest resolver API was checked in jest-resolve 29.7.0 `build/index.d.ts` and `build/defaultResolver.js`, which expose resolver conditions and the default resolver.
- Cached Metro package exports reference: `/workspace/.setup/metro-package-exports-2026-10-05.md`; the review notes the exact-target behavior and custom resolver delegation relevant to this fix. The earlier focused analysis is in `/workspace/.setup/ST172-platform-resolution.md` and Metro-specific recommendation in `/workspace/.setup/ST172-metro-resolution.md`.

No native/Hermes result is implied by Jest or Expo Web. No source or application logic was changed as part of this review; this file is the only review artifact written in this final pass.

## Final comment-only approval delta

A final lint follow-up added only the two leading comments in `apps/mobile/jest.workspace-resolver.cjs`: the Node globals declaration and a single-line `no-require-imports` exception explaining Jest 29's CommonJS custom-resolver contract and the Node path import. Removing those two lines reproduces the previously reviewed resolver hash exactly (`aa0e7605fd7fddc61f153dab106bb0bc5983851e0bee2cf86c3af9da98461d83`). The current resolver hash is `44c965bdcc5e51e616d008d197c735a65fdf6ed200428eda9fbea999b008a423`. Jest config and Metro config hashes above are unchanged. **Approval extends to this comment-only lint delta; no executable resolver behavior changed.**

Final QA reported by root: all 101 mobile tests across 19 suites pass; mobile lint and typecheck pass; 16 focused tests pass. Aggregate coverage is statements 86.56%, branches 84.61%, functions 65%, lines 88.13%; the new demo/helper files report 100% function and line coverage. Native/Hermes execution remains pending and continues to block merge/adoption.
