# ST172 completed mobile demo

The localized Welcome launcher opens a read-only fictional household with all six original exact prices and cadences. The mobile runtime imports only the explicit React-free `@subtrack/i18n/catalogs/demo-fixture` JSON entry; it does not call a money formatter or import money/synthetic/UI runtime packages. Missing labels or an incomplete fixture hide all amounts with truthful localized unavailable copy. The unused money helper and scoped Jest/Metro workarounds were removed.

UI tooling formats one canonical DTO through the public fixture and bigint formatter before writing either artifact. It atomically replaces each complete JSON file; normal tests verify both are fresh. Real temporary-file tests prove unsafe input and a late locale-formatting error preserve both destinations. Two file renames are not claimed to be a filesystem transaction.

Final mobile94tests/18suites, UIfixture3tests, sharedboundary8tests, relevant lint/typecheck, root lint on the actual mobile screen and catalog parity passed. Expo Web10browser scenarios passed: eight locale/theme/width states plus two unavailable-BigInt formatter cases showing original prices with zero calls. The final eight clean screenshots have design approval; client/platform approvals bind final source. The introduced UI React19 peer mismatch was eliminated by using the existing React-free i18n dependency. Remaining Storybook peer warnings are pre-existing.

The user explicitly approved deferring Android/iOS verification: “Push it to done for now. We can verify later in android and ios.” Native Hermes execution/rendered-state validation is TODO in ST174, not passed. No full UF12 server/session/tenant/rate-limit or authentication completion is claimed. Exact-head CI remains required before merge.

`historical-runtime-prototype/` preserves earlier draft evidence; its old helper/probe/native-gate and source hashes do not describe the final JSON-backed feature. Current evidence and source manifest are at this directory root.

Deterministic generation mode passed3tests. Static Expo Web export passed using its project-root mode; actual source maps verify the i18n JSON entry and exclude money/synthetic and the UI runtime index. The development workspace-root flag is reserved for the dev server, not static export.
