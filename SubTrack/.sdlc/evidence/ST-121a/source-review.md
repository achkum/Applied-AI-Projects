# ST-121a independent architecture and security source review

Date: 2026-10-10. Reviewer: independent architect-data/security-privacy agent, separate from the author and Conductor.

Verdict: APPROVED for the bounded offline implementation and ADR-0019. No remaining blocking source findings. Merge remains subject to independent QA and required exact-head CI. This is source/design approval, not a claim that this reviewer executed the test suite.

Reviewed frozen SHA256 values:

- pipeline.ts: E1BF9CCCBD63E888ADA85522F4CE2C12EE476DF31D33164684D35A51499570B4
- cli.ts: D9C476AE39FC343C98FFC7F2F2E4B0E11395BECF8124BF18A04859768836A2CE
- offline-catalog.spec.ts: 611536155BCD5DC3E11915915D6438B32F134048A640C0BAA49E8770FB330436
- sources.yaml: 7BE694C21ED27EA5C6DE3A1F20875A789D0E673FB497C1B04F6F8583AA6A8B0D
- package.json: BC1C758896CCD3EF651E7284E57EE5C2CF84F3DF6F89D330F59A8773E10A96C5

The initial price substring and registry validation findings are resolved: full anchored positive whole-SEK monthly grammar rejects mixed amounts/currencies, supported registry IDs require exact string URLs, and duplicate/empty plans fail validation. Money conversion and absolute 40% comparisons use workspace Money with decimal-string artifacts. Source extraction failure discards the entire source; missing/zero baselines and excessive changes retain quarantine amounts.

Isolation is appropriate for supplied bounded local HTML: a fresh nonpersistent context disables JavaScript and service workers, installs request abortion before page creation, uses setContent on the initial blank page, and prefixes restrictive CSP. Meta refresh fails the complete source. Context closure cannot prevent browser closure because cleanup uses nested finally. Bounded regular-file reads, resolved manifest-directory containment and exclusive new-file output avoid accidental input overwrite. Logs contain generic status/errors rather than HTML or credentials.

Reviewed test source covers real child CLI execution for both synthetic fixtures, validation failures, ambiguity/malformed prices, exact 40% increases/decreases, missing/zero baselines, size limits and output preservation. Hostile markup includes script/image/refresh plus owned local-file frame/object stimuli; assertions cover zero owned HTTP hits, source quarantine and no sentinel disclosure. Those assertions support the scoped markup boundary; they do not constitute an OS sandbox or independent inspection of every browser subsystem. The reported 64-test/lint/typecheck results and coverage belong to the author/repair evidence; independent QA and CI must establish runtime success.

Reviewed dependency/CI diff adds catalogue-owned pinned Playwright/tsx and workspace Money, with tsx optional-peer lockfile expansion and existing Chromium installation moved before tests. No unrelated version upgrades were observed in that diff.

ADR-0019 is accepted as the final design for this scope. Storytel and BookBeat registry URLs identify candidate sources only: terms remain unresolved, live fetching stays disabled, synthetic selectors do not establish current-page compatibility, and capturedAt/provenance remain caller-supplied. No source permission, verified price, actual capture origin, production release, or completion of parent ST-121 is granted by this review.
