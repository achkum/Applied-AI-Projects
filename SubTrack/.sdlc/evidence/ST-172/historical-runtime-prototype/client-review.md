# ST-172 Architect-Client Review

**Verdict: APPROVE (source review only; conditional).** No blocking or major client-boundary issue was found in the reviewed source. This approval does not authorize merge/adoption: native Expo/Hermes validation on each supported platform remains an explicit pre-merge gate under ST-171/ST-172. Expo Web/Metro, Node, and component tests do not satisfy that gate.

## Reviewed source identity

SHA-256 hashes identify the reviewed implementation and locale content:

| File | SHA-256 |
|---|---|
| `apps/mobile/src/components/DemoHouseholdScreen.tsx` | `fbca9b4df16584298080b1fc101104e15e0a0eacd7d0d69a97e3dbf5bcdde7cc` |
| `apps/mobile/src/components/demo-money.ts` | `1cb3ece363f1dc233879edc8ade6cf1a75686e9c50ce6a07391bb7799313390a` |
| `apps/mobile/src/components/WelcomeScreen.tsx` | `62587802686a7623d7b9a4925cb7da79482ae3ef7dcb09e26af27800093cd47c` |
| `apps/mobile/app/(tabs)/en/demo.tsx` | `5142d8261fbe8db02b2e2c27cdea7c122d375336ad081bd315a458a2dd073cb7` |
| `apps/mobile/app/(tabs)/sv/demo.tsx` | `6ec103c62b8b0fc89b0068a82dfc566b790730deb4a6fcdd7b98d1a809d9105d` |
| `packages/i18n/catalogs/en.json` | `d916d55538eb5c7b6a4d27f6ede967236ff49b8d24b7af9c3aff106be99009b1` |
| `packages/i18n/catalogs/sv.json` | `b643675b16e3c041ad7225ff9916add3385b6070d89da438d671b1f181974df5` |

The component and adapter test files were also inspected; they were being strengthened during this review and are not included in the implementation identity above. Recompute hashes before relying on this approval if any listed file changes.

## Findings

No blocker, major, or minor source finding. The English and Swedish routes pass their route locale explicitly. The screen uses that locale for copy even when provider locale differs, and the return action targets the corresponding Welcome route. The Welcome composition adds one localized demo launcher while leaving `WelcomeActions` and account/login destinations uncomposed.

The demo screen reads the public Lindqvist fixture directly. It displays the fictional-data banner and household identity, and presents each subscription's source amount with its original monthly or annual cadence. No household total, cadence normalization, Orbit number fallback, network, auth/session, tenant claim, storage, provider, or persistence action is present.

The exact-money probe runs before fixture adaptation. It checks BigInt and BigInt-aware `Intl.NumberFormat`, exercises large and negative-subunit SEK formatting, and checks JPY/SEK/KWD exponents through the public formatter. Probe or formatting exceptions return the localized unavailable state; fixture values pass `assertSafeMinorUnits` before `BigInt` conversion. The probe result is not rendered, and the failure branch renders no amount.

New controls have 48 logical-unit minimum heights and accessible button labels. Subscription rows are exposed as accessible elements with merchant, amount, and localized cadence in the label. The screen uses theme palettes and type/radius tokens; long titles and price/cadence pairs can wrap in the scroll view. This is a source review; I did not inspect Expo Web screenshots or claim a visual/browser pass.

## Validation boundary

The root agent reported that its focused 2-suite, 13-test run passed and that its actual Expo Web scenarios were still running at review time. I did not run tests or a bundle. Record those results separately when complete. Native Hermes execution and rendered-state evidence remain pending and block merge/adoption even with this conditional source approval.
