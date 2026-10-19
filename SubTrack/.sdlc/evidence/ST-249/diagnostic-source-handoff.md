# ST249 closed baseline diagnostic correction

2026-10-14. Source author at committed base `d92240c22f6ca6d826f1556f2317f78436d69db1`. Changed only allowed `private-mobile-detection.integration.ts` and `private-mobile-detection-qualify.sh`; independent final review required. No API typecheck while backend author edits, Git, SQL dispatch, hosted rerun, Docker/VPS operation or secrets.

The failed actual run had successful types/descriptor setup and owned cleanup, but its Node catch/shell filter discarded existing parent/bank failure labels before private working logs were removed. This patch reexports the existing independently reviewed `safePrivateBankFailure` helper from bank diagnostics through detection integration, exactly as the existing bank integration does. Node failure output preserves that helper's existing closed grammar, exact existing ST244 phase enum, and ST249 phases. The shell inherits the bank qualifier's entire existing ST248/ST244 grammar byte-for-byte and appends ST249. No Error stack/message/value is emitted unless the complete primitive own-data-property message matches the closed roster; newline, accessor, malformed, unknown and hostile proxy cases map to fixed ST249 phase UNKNOWN. Synchronous bundle/module/load/config errors map to fixed phase SETUP. These are diagnostic enum additions only.

Application assertions, original parent/bank/detection execution order, fixture grants/authority, receipt creation/schema and cleanup-first publication remain unchanged. The new catch does not turn failure into success, run an extra baseline or broaden artifact uploads. No reconstruction of the deleted previous failure cause is claimed; the next reviewed exact-head qualification will expose any already-known baseline failure label.

Actual isolated source verification:
- Executed the actual extracted Node proof heredoc in a VM with injected failure-only file/bundle/integration dependencies; no real proof, SQL or receipt writes. Actual existing bank diagnostic helper compiled in memory. **499 cases PASS**: every inherited parent phase, every bank phase and every fixed two-owner step/category combination, every ST249 phase, unknown/private-canary suffix/newline, malformed grammar, null/string errors, accessor never invoked, hostile descriptor proxy, and synchronous setup failure. All outputs compared internally; printed only aggregate PASS metadata.
- Executed actual Git Bash grep binary with the exact shell source grammar: all closed positive labels retained; arbitrary private canary and suffix lines excluded. Independently asserted inherited grammar prefix byte-identical to existing bank qualifier.
- Compiled both actual qualifier heredocs with Node VM syntax parsing; Bash syntax PASS and scoped whitespace diff PASS. No unchanged test inventories or API/source checks repeated.

Exact final SHA256:
apps/api/test/private-mobile-detection.integration.ts 01f09cf25c105cb4140787af87e884c89f033e858670fbd00dd6801cc4a579e0
tools/database/private-mobile-detection-qualify.sh f62bdc0ace2a552b8d34541d37cb1122e9c32b12bdeb13128535aa3abcac02bd

Source diff14 insertions/3 deletions across two files. Root curates after independent review, scans/pushes and dispatches one genuine new-head qualification. Sandbox author streams continue independently. Short isolated-check slot released.
