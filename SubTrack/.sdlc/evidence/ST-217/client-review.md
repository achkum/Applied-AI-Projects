# ST-217 independent client architecture review

Decision: REQUEST CHANGES (Type 2a plan review only). Source base `0bda40480d590f88b990eb25f945f53deec1e7b8`; reviewed plan blob `9f64ba24dfbdb84596f7bba9b0bd4e24606529ec`.

The plan correctly preserves the approved detail frame, owner-only actions, seven transition pairs, target-only PATCH, bounded errors, re-read after conflict/uncertainty, sv/en and accessibility, and keeps implementation NOT_READY pending a reviewed signed-in browser principal/session and usable GET/PATCH runtime. ST-216 loopback is insufficient; do not invent auth scope or persist credentials.

Blocking client mismatch: `VisibleSubscription.expectedAmountMinor` is a canonical decimal string (`packages/contracts/openapi.yaml`, `SubscriptionOwnerView`/`SubscriptionPeerView`), while the existing `ReceiptCard` and `PricePoint` require `number` and format with division (`packages/ui/src/components/ReceiptCard/ReceiptCard.tsx`; `packages/ui/src/utils/formatMoney.ts`). The plan promises to retain `ReceiptCard`, use canonical minor units, and confines later implementation to web/i18n paths. Specify a contract-safe rendering approach using `packages/money` bigint formatting, including any necessary UI component/interface scope, without `Number` conversion.

The approved Spotify screen also hard-codes five price-history points and the name/amount (`apps/web/app/[locale]/subscriptions/[id]/subscription-detail.tsx`). GET detail has no price-history field and only optional `customName`/`merchantName`; explicitly retire mock values in the live route and define a localized safe fallback for absent names. Do not imply the fetched projection proves price history.

This is a plan review, not implementation or QA approval. Re-review the revised plan before marking the client review accepted.

## Cycle 2 — APPROVE

Reviewed revised plan blob `311ff4460413f212abc70eccd0b992ffec6983f0` against the same source base. The plan now specifies canonical string → `BigInt` → `packages/money` formatting, with later `ReceiptCard` interface scope in `packages/ui`; it excludes `Number` conversion. It explicitly removes fixture name, amount, history and inferred savings from the live view, and adds a localized unnamed fallback. Both prior client blockers are resolved. The 401/404 and failed re-read states also clear private detail and disable actions. Approval is for the Type 2a plan only; authenticated browser/session and usable GET/PATCH runtime remain prerequisites, with implementation and QA unclaimed.
