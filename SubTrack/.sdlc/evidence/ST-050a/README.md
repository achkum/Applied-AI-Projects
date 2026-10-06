# ST-050a verification

85 tests in 8 web files pass, including normalization boundaries, native form behavior and four locale/theme axe cases. Changed TypeScript coverage: form 92.85% statements / 96.29% branches / 85.71% functions / 96.15% lines; normalizer 95.65% / 96.42% / 100% / 96.55%; public Button 100% all metrics. Matching Vitest/coverage 5.0.2. Scoped ESLint, web TypeScript, catalog parity and actual Next 16.3.6 production build pass.

Actual Chromium isolated Vite harness passes four locale/theme combinations, native Enter/click callbacks, invalid input blocked, channel reset, loaded font, measured contrast and 375px overflow checks with zero console/page errors. Screenshots show the actual component, not a published registration route. Focus/error states were reviewed from source. Source hashes and independent client/design/security approvals are included.

Context: first author retired at20 calls; fresh narrow fix12 plus4 security followup=16. Initial target budgets were exceeded and recorded, not reset to imply savings. Security review6+4 calls. Some review counts were unreported; zero guard counters do not mean zero usage. Token telemetry unavailable. Parent ST050 remains incomplete. Exact-head CI/accepted-main receipt follows PR creation.
