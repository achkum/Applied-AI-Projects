# ST-238 independent client/design source review

2026-10-11. **Scoped source APPROVE; actual visual/browser gate HOLD.** I reviewed the frozen client candidate on `st/ST-238-private-owner-subscriptions` against the accepted ST-237 base `2f55e95b6bdc5340b01b0de68dbf42900f073b6d`, ST-238 task/readiness, client and formatter handoffs, repository governance, and the current private API contract/handler. Working-tree HEAD while reviewing was `894460944f42dce7f9cbf440880afc4223c665d2`; this is **not** an exact-head integrated or visual approval. No source, test, or Git state was changed by this reviewer.

## Source conclusion

No blocker or major client/design finding in the source pinned below. The mounted registration flow retains a volatile CSRF ref and abort/generation fence. It gates Just me on the separately reread complete profile, sends one explicit choice, separately reads persisted mode, then reads an owner page from the same browser session. List rows are decoded owner views, IDs enter detail only from displayed rows, and legal status controls derive from the selected detail status. PATCH is sent once; a distinct detail read determines the displayed status. On uncertain writes, the flow performs one read and does not announce confirmed success from the uncertain response. Failed authoritative reads stop at fresh verified login and clear private rows, detail, and CSRF. Reload and partial terminal-credential paths retain that stop.

The private adapter uses credentialed no-store JSON requests, bounded fatal UTF-8 response reading, exact closed problem mapping, and strict owner-only decoders. Those decoders reject extra fields, peer projections, malformed dates/minor strings, unknown status/cadence/category values, duplicate IDs in a page, and inconsistent continuation. The 50-row UI exposes Load more, preserves prior rows, rejects cross-page duplicate IDs, and never presents a first-page empty state while a request is pending. Copy is in both locales and CSS uses tokens. The UI facade exports only the existing pure `formatMinorUnits` formatter; UI now declares money at runtime and web has no direct money dependency/import. No new money arithmetic or configuration boundary change was found.

**Minor test-quality note:** `private-subscriptions.test.tsx` fires an Enter key event and then separately calls `fireEvent.click` before asserting selection. That demonstrates the click path, but not browser keyboard activation by Enter itself. Actual browser keyboard/focus proof should close this gap; no source change is required for this scoped approval.

## Remaining gates and limits

This review does not claim actual PG/HTTPS proof, API/storage/security approval, all four `sv/en × light/dark` screenshots and focus observations, integrated exact-head QA, CI, or merge readiness. Those are **HOLD** until the separate receipts and reviewers complete. Focused 13/13 web tests and parity were reported in the client handoff; UI 2/2, private display 3/3, lint and typecheck were reported in the formatter handoff. I inspected their source but did not rerun them. API/contracts and proof files may still change; compare the normalized SHA-256 pins below with the final reviewed commit before carrying this scoped approval forward. Any changed pin requires targeted rereview.

## Normalized source pins

SHA-256 of each file's bytes after CRLF-to-LF normalization; paths are relative to `SubTrack/`:

| Path | SHA-256 |
| --- | --- |
| `apps/web/lib/private-onboarding-api.ts` | `9ec7e66b6f933616b63644dd546ee17a585a54ace671aef20f220025c39ced1f` |
| `apps/web/components/onboarding/private-subscriptions.tsx` | `f51ec8c1e2e22a07e2e92cb4f44c62ab8e91cdd53a3ba1e2f794be2204c139f6` |
| `apps/web/components/onboarding/private-subscriptions.module.css` | `945152b2869e2f8dfcfe2c8fda472c62bb4cc6032f8a756f5e671d7b3522e764` |
| `apps/web/components/onboarding/registration-flow.tsx` | `2c318927086efae021d51cb156199238500b1418766cf1c4228a8f508a1b097e` |
| `apps/web/test/private-onboarding-api.test.ts` | `8a568dcf17ab067cb5352b583dd7cc5a8e9c44be6223a3b13ff8773009b72d8a` |
| `apps/web/test/private-subscriptions.test.tsx` | `85c0d0c5de14437a70b2076deb57a66ebba174936d9207403d481ad294be6729` |
| `apps/web/test/registration-flow.test.tsx` | `eb772be4c262cfd9fe7847b8735101723969cfb123d755524e1be3afec3ef125` |
| `packages/contracts/private-onboarding.ts` | `7c4e8f1cf0434800314ad3d8765bbc7d37b0031ed39067bd855a6ee1144dbc99` |
| `packages/ui/src/index.ts` | `9b1c660c952793d0e92dd5f448905e0b4217ba72d6584b1a38f15ed54b209abf` |
| `packages/ui/src/money-display.test.ts` | `d02a5085f10e3b798c8cc984f1138b8c21cba0587cb7904a6ab3cb2ee0b5567c` |
| `packages/ui/package.json` | `8f8f79762fdc917b4eeafceacf808e59daf80298b102782aa250fa3f8cf61669` |
| `apps/web/package.json` | `0924e79a59bbbb427a5029037014d2b4ce531513866fc079339ccae037c90da2` |
| `packages/i18n/catalogs/en.json` | `b4b9cef799ae919338d15a2d4c4e6fccd3812da9773c50068e1cfc897c4c2d1a` |
| `packages/i18n/catalogs/sv.json` | `0154811be8a142bd407fdf898b848f17b6074e669691de5605926611a0887735` |
