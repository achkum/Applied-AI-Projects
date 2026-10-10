# ST-121a independent QA

Date: 2026-10-10. Reviewer: independent QA.

## Result

Independent CLI proof passed on the frozen source revision. All fixture markup and input values below were synthetic and created in unique temporary directories. The checks make no claim about current Storytel or BookBeat pages, prices, markup, or source permissions.

Each successful run used the real package command from the SubTrack workspace:

```text
corepack pnpm --filter @subtrack/catalog catalogue:extract -- <manifest.json> <candidate.json>
```

The Storytel and BookBeat runs produced the expected two SEK observations each. The artifact assertions checked the exact SHA-256 of the HTML input, capture time, synthetic provenance, registered source URL, extractor version, SEK currency, and `marketPriceVerified: false`; they also checked that no quarantines appeared for matching baselines and that the artifact made no current/native-price claim.

Price quarantine checks passed for an exact 40% increase (accepted), a 41% increase (quarantined as `change_over_40_percent`), a decrease greater than 40% (quarantined by absolute change), and absent baselines (both plans quarantined as `baseline_missing`).

The hostile synthetic fixture combined a meta refresh to an owned loopback HTTP listener, a loopback image, a script request, and iframe/object references to a temporary sentinel file. The command produced zero candidates and a source-level `source_extraction_failed` quarantine; the loopback listener received zero requests and the sentinel contents did not appear in the artifact. This proves no requests reached the owned listener for this fixture; it does not assert that a request was never attempted before browser policy blocked it.

Invalid `../escape.html` input was rejected with no artifact. Two output aliases were rejected: output equal to the HTML input, which remained byte-for-byte unchanged, and output equal to the manifest, which remained unchanged. Temporary fixture directories and synchronous CLI child processes were closed; the QA temp directories were confirmed removed.

## Workflow review

The CI change is approved. It relocates the existing Playwright Chromium installation to immediately before `pnpm test`, where the catalogue browser test now needs it, and retains that install for Storybook visual regression. The install still runs through the UI package; both UI and catalogue pin Playwright 1.63.0. No workflow permissions changed, and no steps or checks were skipped or removed.

## Frozen source fingerprints

SHA-256 values captured after the CLI proof:

| File | SHA-256 |
| --- | --- |
| `packages/catalog/src/scraping/cli.ts` | `D9C476AE39FC343C98FFC7F2F2E4B0E11395BECF8124BF18A04859768836A2CE` |
| `packages/catalog/src/scraping/pipeline.ts` | `E1BF9CCCBD63E888ADA85522F4CE2C12EE476DF31D33164684D35A51499570B4` |
| `packages/catalog/test/scraping/offline-catalog.spec.ts` | `611536155BCD5DC3E11915915D6438B32F134048A640C0BAA49E8770FB330436` |
| `packages/catalog/package.json` | `BC1C758896CCD3EF651E7284E57EE5C2CF84F3DF6F89D330F59A8773E10A96C5` |
| `packages/catalog/sources.yaml` | `7BE694C21ED27EA5C6DE3A1F20875A789D0E673FB497C1B04F6F8583AA6A8B0D` |
| `packages/catalog/src/scraping/README.md` | `FFEAD18F99862D8A2C154D4FE4A7EC9A29BC57E4243595C43CA2F961D168DF89` |
| `.github/workflows/subtrack-ci.yml` | `A77E318309579D23445CBA938BDCA74F563D09B57FA669E79873E4E59AC6E462` |
