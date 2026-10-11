# ST-238 C4 independent client/design source review

2026-10-11. Frozen PR283 HEAD `375f52b5e7b59b606f4dca8fcef7d0718f452617`. **Scoped client/design source APPROVE; actual screen and interaction review HOLD.** This reviewer changed no product source or Git state.

The fourteen client paths from `client-source-review.md` were checked with SHA-256 after CRLF-to-LF normalization. Thirteen are byte-equivalent to the earlier independent review. The sole changed pin is `packages/ui/src/index.ts`: old `9b1c660c952793d0e92dd5f448905e0b4217ba72d6584b1a38f15ed54b209abf`, C4 `6e27ffe76710aeb1df3be9e835c42242e24ed4c471dc208878902fb84b728bae`. Its only relevant change is the public `formatMinorUnits` re-export from `@subtrack/money/formatter`. I inspected that public formatter subpath, pure bigint formatter, and UI public-entry test. The facade adds no money arithmetic or client server access; the test covers large signed values, Swedish/English, zero-decimal JPY, and invalid input. The prior thirteen matching pins are:

| Path | C4 normalized SHA-256 |
| --- | --- |
| `apps/web/lib/private-onboarding-api.ts` | `9ec7e66b6f933616b63644dd546ee17a585a54ace671aef20f220025c39ced1f` |
| `apps/web/components/onboarding/private-subscriptions.tsx` | `f51ec8c1e2e22a07e2e92cb4f44c62ab8e91cdd53a3ba1e2f794be2204c139f6` |
| `apps/web/components/onboarding/private-subscriptions.module.css` | `945152b2869e2f8dfcfe2c8fda472c62bb4cc6032f8a756f5e671d7b3522e764` |
| `apps/web/components/onboarding/registration-flow.tsx` | `2c318927086efae021d51cb156199238500b1418766cf1c4228a8f508a1b097e` |
| `apps/web/test/private-onboarding-api.test.ts` | `8a568dcf17ab067cb5352b583dd7cc5a8e9c44be6223a3b13ff8773009b72d8a` |
| `apps/web/test/private-subscriptions.test.tsx` | `85c0d0c5de14437a70b2076deb57a66ebba174936d9207403d481ad294be6729` |
| `apps/web/test/registration-flow.test.tsx` | `eb772be4c262cfd9fe7847b8735101723969cfb123d755524e1be3afec3ef125` |
| `packages/contracts/private-onboarding.ts` | `7c4e8f1cf0434800314ad3d8765bbc7d37b0031ed39067bd855a6ee1144dbc99` |
| `packages/ui/src/money-display.test.ts` | `d02a5085f10e3b798c8cc984f1138b8c21cba0587cb7904a6ab3cb2ee0b5567c` |
| `packages/ui/package.json` | `8f8f79762fdc917b4eeafceacf808e59daf80298b102782aa250fa3f8cf61669` |
| `apps/web/package.json` | `0924e79a59bbbb427a5029037014d2b4ce531513866fc079339ccae037c90da2` |
| `packages/i18n/catalogs/en.json` | `b4b9cef799ae919338d15a2d4c4e6fccd3812da9773c50068e1cfc897c4c2d1a` |
| `packages/i18n/catalogs/sv.json` | `0154811be8a142bd407fdf898b848f17b6074e669691de5605926611a0887735` |

The C4 OpenAPI definitions for browser-only mode choice/read, owner list read, profile read and profile PATCH require both `ExactOrigin` and `BrowserSessionCsrf`; the latter requires a nonempty value. Shared mobile-capable Origin/CSRF components remain optional. The unchanged client adapter sends credentialed no-store JSON with `X-Session-CSRF`; the browser supplies Origin. UI IDs derive from listed rows, lifecycle controls from selected status, and the flow separately rereads persisted mode and status. The unchanged C1 source review's privacy, pagination, stop, localization and token conclusions carry under the matching pins. The existing Enter/click test caveat still needs actual keyboard/focus observation.

This is not actual PG/HTTPS/browser, all-variant visual, CI, or merge approval. Actual artifacts remain pending.
