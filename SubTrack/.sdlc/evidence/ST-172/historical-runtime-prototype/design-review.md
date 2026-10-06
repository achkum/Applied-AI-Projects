# ST-172 design review — APPROVE

**Decision:** APPROVE for the design-lead review of the Expo Web implementation at the source hashes below. This is visual/design approval only; it does not clear the separate required native Hermes pre-merge gate.

## Reviewed evidence

Inspected the eight actual Expo Web screenshots for `en`/`sv` × light/dark × 375/320 logical units, plus the English precision-loss unsupported-state screenshot. The matching browser QA record reports no errors or horizontal overflow across the eight normal states and confirms both injected precision-loss cases hide all amounts and show a localized unavailable message. The demo route returns to its matching localized Welcome route. Source review confirms the banner and return action use theme values and both return/demo-launch controls have 48-unit minimum heights.

The visual hierarchy is clear: brand, prominent fictional-data notice, household name, read-only description, six readable subscription rows, and return action. At 320 units, the household heading and descriptive copy wrap naturally; all six merchants, exact original prices, and monthly/annual labels remain visible without clipping. Light and dark versions use the intended warm-paper/ink palette with restrained violet accent. The unsupported state presents no prices. No household total or normalized monthly amount appears.

The screenshots include Expo's development overlay text `Refreshing… / Don't see your changes? Reload the app` at the bottom. This is tooling chrome in the captured development build, not part of the task screen or a fabricated app loading state.

English price strings follow the accepted public formatter's current `en-SE` output (`139,00 kr`). The design direction gives `SEK 1,390` as an English example; this implementation follows the task's mandated public formatter. Any change to that package-level locale presentation should be reconciled separately with its formatter contract, rather than approximated in this screen.

## Source binding

SHA-256 hashes at review time:

| File | SHA-256 |
|---|---|
| `apps/mobile/src/components/DemoHouseholdScreen.tsx` | `fbca9b4df16584298080b1fc101104e15e0a0eacd7d0d69a97e3dbf5bcdde7cc` |
| `apps/mobile/src/components/WelcomeScreen.tsx` | `62587802686a7623d7b9a4925cb7da79482ae3ef7dcb09e26af27800093cd47c` |
| `apps/mobile/app/(tabs)/en/demo.tsx` | `5142d8261fbe8db02b2e2c27cdea7c122d375336ad081bd315a458a2dd073cb7` |
| `apps/mobile/app/(tabs)/sv/demo.tsx` | `6ec103c62b8b0fc89b0068a82dfc566b790730deb4a6fcdd7b98d1a809d9105d` |
| `packages/i18n/catalogs/en.json` | `d916d55538eb5c7b6a4d27f6ede967236ff49b8d24b7af9c3aff106be99009b1` |
| `packages/i18n/catalogs/sv.json` | `b643675b16e3c041ad7225ff9916add3385b6070d89da438d671b1f181974df5` |

Screenshots: `/workspace/.setup/ST172-{en,sv}-{light,dark}-{375,320}.png`; unsupported state: `/workspace/.setup/ST172-en-unsupported.png` and `/workspace/.setup/ST172-sv-unsupported.png`. Browser QA record: `/workspace/.setup/ST172-browser-qa.json`.

Any change to the bound screen, launcher, route, or catalog source requires a new design review. Native Hermes execution of the capability probe and rendered screen remains an explicit pre-merge gate; Expo Web screenshots and browser QA do not satisfy it.
