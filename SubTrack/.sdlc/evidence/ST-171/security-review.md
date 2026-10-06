# ST-171 independent security and privacy review

**Decision: APPROVE** for the reviewed source hashes below, against the accepted proposed contract. This approval is limited to the scoped formatter implementation and does not establish Expo/Hermes support or authorize a mobile caller migration.

## Hash binding

- `packages/money/src/formatter.ts` — `13d249b0b7194f0f94e89dc8f1edf6c1fee9024092ad0c0264184bf8c2b612f4`
- `packages/money/src/index.ts` — `ea893d5440f7273c4a54f4877a0d8536c09ab409928d5440e83bc3f94eeee23b`
- `packages/money/test/minor-units-formatter.spec.ts` — `2284a0e1070b31f705091d3fa5515602edcb60f9f58042d28453cb88f500a6c6`
- Accepted design `/workspace/.setup/bigint-formatter-proposed-contract.md` — `3a15709c0c8c3493753cd53b250e3ec6c7c96154b9dd8026c415ce8aa5519e45`
- Task `.sdlc/tasks/ST-171.md` — `136c314688e98f01a9f39aa6756fac15e89390e3a4caf364f2a8734111ace0e5`

The source/design approval is bound to the exact `formatter.ts`, `index.ts`, new test, and accepted design hashes above. It remains valid if the task file receives lifecycle-only status or QA Handoff edits, provided the approved source files and design/acceptance contract remain byte-identical. The task hash records the reviewed task snapshot; it is not a source approval boundary. If task edits change implementation scope or acceptance criteria, request a fresh review.

## Findings

- **Exact arithmetic:** `formatter.ts:92-107` uses a BigInt absolute value, power-of-ten scale, quotient, and remainder. The new path does not convert money through `Number`, floating division, or `Math.pow`. The existing `formatMoney` number path at lines 42-62 is unchanged; `minorUnitExponent` remains unchanged at lines 128-134.
- **Sign and layout:** `formatter.ts:96` chooses a negative currency template for every negative amount, including `-1n`; zero uses the positive template. Lines 97-120 substitute grouped integer parts and localized zero-padded fraction digits while preserving other currency-template parts. This follows the approved algorithm for the accepted symbol/code/narrow-symbol set.
- **Input and option handling:** `formatter.ts:70-81` checks the runtime amount type without interpolating its value into the error, validates locale and display before formatter construction, and explicitly rejects `name` and other unsupported displays. Invalid currency construction remains delegated to native `Intl.NumberFormat` at lines 84-88. The existing checked metadata guard and its stable `RangeError` message are preserved at lines 21-33 and used at lines 89-91.
- **Privacy:** No input logging, telemetry, persistence, network calls, or error interpolation of the amount was found in the new API. The test's sentinel string (`secret`) is synthetic and is used only to assert the non-bigint error does not expose the supplied value (`minor-units-formatter.spec.ts:38-41`).
- **Public surface and scope:** `index.ts:1-10` exports the formatter and its types through the package root. The new test imports that public root (`minor-units-formatter.spec.ts:2-5`). No caller migration or platform claim is present in this reviewed implementation.

## Evidence

The author-provided validation logs were read, not rerun as part of this review. They report 25 focused legacy+new tests passed with 100% statements (41/41), branches (37/37), functions (9/9), lines (40/40), and exit code 0 in `ST171-tests.log`; money lint and typecheck each report exit code 0 in `ST171-lint.log` and `ST171-typecheck.log`. The 25 tests comprise the existing formatter coverage plus the eight new test cases. These are implementation validation evidence, not independent runtime portability evidence.

The proposed contract records Node `Intl.NumberFormat.formatToParts(BigInt)` experiments. As required by the contract, this review makes no inference about native Hermes support or locale data. Validate those before any mobile adoption. The reviewed algorithm also depends on the runtime's currency metadata and `formatToParts` implementation; the source checks that the reported fraction count is finite, integral, and nonnegative before using it.
