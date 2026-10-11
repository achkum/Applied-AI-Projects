# ST-237 browser diagnostic correction C2

Frozen head `7d231598`, workflow run `38142615868`, reported `DIAG ST237_BROWSER phase=TRUSTED_NAVIGATE class=OTHER` and `cleanup=removed` before any browser PASS marker. This does not establish whether page creation, TLS navigation, or a returned HTTP response failed.

The proof now distinguishes `TRUSTED_PAGE`, `TRUSTED_NAVIGATE`, and `TRUSTED_RESPONSE`. If navigation returns, an integer response status from 100 through 599 produces a bounded `HTTP_<status>` class; an absent response produces `NO_RESPONSE`. The 200 assertion remains mandatory. Known Firefox network/TLS errors, browser-context closure, and the proof's exact assertion messages map to fixed classes. The shell validates the entire diagnostic line against its phase/class allowlist before receipt export; raw errors stay inside the removed private directory.

Read-only route inspection found a real `app/[locale]/register/page.tsx` whose page accepts the `sv` locale. The web middleware includes `sv`; `next.config.ts` only defines an API rewrite for development. These facts do not establish the cause of the observed CI failure.

Focused local checks passed: `node --check`, `bash -n`, and `corepack pnpm --filter @subtrack/web exec eslint test/private-https-preflight.mjs`. The lint correction imports Node `process` and `console` explicitly and uses `globalThis.fetch` inside the browser callback. A new exact-head Linux proof is required before a cause fix or full-feature source GO.
