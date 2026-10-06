# ST-171 architect-platform review

**Decision: APPROVE**

Reviewed the proposed contract at `/workspace/.setup/bigint-formatter-proposed-contract.md`, task `SubTrack/.sdlc/tasks/ST-171.md`, repository instructions, Constitution, implementation, public export surface, focused tests, unchanged legacy tests, author handoff, and supplied validation logs.

## Findings

- Exact amount handling matches the contract: `formatMinorUnits` obtains the exponent from currency `Intl.NumberFormat.resolvedOptions()` and applies `checkedFractionDigits` (formatter.ts:83-91); absolute amount, scale, quotient, and remainder are calculated with bigint operators (formatter.ts:92-95). The amount is never converted to `Number` or floating point.
- The Intl template is requested with `±1n`; grouped whole units and padded fractional digits are independently formatted from bigint (formatter.ts:96-107). The template's sign, separators, currency placement, and literals are retained while numeric parts are replaced (formatter.ts:108-121). This supports negative subunits and currencies with exponent zero.
- Grouping and locale behavior come from the existing `sv-SE` / `en-SE` mapping (formatter.ts:16-19, 97-107). Supported display values are exactly `symbol`, `code`, and `narrowSymbol`, with explicit runtime rejection of other values and locales (formatter.ts:74-81). Invalid currency construction remains delegated to Intl (formatter.ts:84-88). Non-bigint errors do not interpolate the supplied value (formatter.ts:70-72).
- The function and its option/display types are publicly exported from the package root (index.ts:1-10). `formatMoney` and `minorUnitExponent` implementations remain as before in formatter.ts:42-62, 128-134; the legacy test file is unchanged by the author handoff and has the same hash recorded below.
- Focused public-index tests cover default Swedish formatting, English locale, all supported display choices, SEK/JPY/KWD, positive/negative/zero and negative subunits, grouping, values above the safe integer range, invalid currency/amount/options, and invalid Intl metadata (minor-units-formatter.spec.ts:9-63). Supplied logs report 25 passing old/new tests and 100% statements, branches, functions, and lines; scoped lint and typecheck both exit 0 (`/workspace/.setup/ST171-tests.log`, `ST171-lint.log`, `ST171-typecheck.log`).
- The review does not infer Expo/Hermes support from Node. As the task and contract require, native runtime support and caller migration remain separate prerequisites; no mobile adoption is authorized by this formatter change. The task's independent Node locale proof is consistent with the design and establishes Node behavior only.

## Source hashes (SHA-256)

| File | SHA-256 |
|---|---|
| `packages/money/src/formatter.ts` | `13d249b0b7194f0f94e89dc8f1edf6c1fee9024092ad0c0264184bf8c2b612f4` |
| `packages/money/src/index.ts` | `ea893d5440f7273c4a54f4877a0d8536c09ab409928d5440e83bc3f94eeee23b` |
| `packages/money/test/minor-units-formatter.spec.ts` | `2284a0e1070b31f705091d3fa5515602edcb60f9f58042d28453cb88f500a6c6` |
| `packages/money/test/formatter.spec.ts` (legacy) | `60f4f973c6ed3b53fd1149f328b13927bf296206cce560dd603a447419ffd25a` |

No source edits or test commands were performed during this review.
