# ST-246 independent security source review

Verdict: GO for functional source against reviewed parent bd04326. No source findings. This is not native acceptance or UX adoption approval. No source edits, Git operations, or heavy tests were performed for this review.

The agenda reuses current NativeSession.run Bearer profile/mode/owner reads. No owner selector, API, SQL, credentials, grants, or authentication model changed. Complete current profile and Just me precede owner pagination; terminal cursor precedes success. Duplicate IDs, repeated cursors, invalid owner views/dates and aborted generations reject rather than publish partial rows. Rows remain in component memory, with no private logs/cache. Active phase gates rendering; logout clears rows and Core authority generation rejects late prior-owner results.

Blur/refresh invalidates and aborts its local read. Only an aborted obsolete view operation is absorbed inside Core's callback; genuine current faults still reach unchanged Core session retirement. Parent focus refresh uses the existing pending/generation guards. Route entry from the list remains gated by complete profile and Just me, and a directly entered route performs those gates again.

Selection validates canonical civil dates, derives local today from device calendar components, and uses UTC arithmetic only as a civil-day ordinal to avoid DST elapsed-hour errors. Exactly today through day+29 is selected for ACTIVE explicit saved dates. Stable date/ID ordering and existing exact Money formatting are preserved. No recurrence, totals, history, provider charge, or concurrent snapshot guarantee is added.

Author-reported policy/mounted/focus/DST/layout/type/lint/parity validation was inspected as reported evidence, not rerun. Parent acceptance, actual installed Android/iOS qualification and the current UX adoption hold remain unresolved gates.

Independently verified SHA-256:

- privateMobileRenewals.ts: 3534f5c22720f1542678e13805466a653e4e84191492e8a1b2f3854f29512583
- NativePersonalRenewalsScreen.tsx: e93ffa1bba178f88d6aa7f54bda4d9d6f1750fae46979148e8341f1cddd1b892
- NativePersonalScreen.tsx: 159cff19e7129558ebaaf801b68ff3f30b869e74ca2f90f17a3f94a62e01100c
- personal-home.tsx: 8e8fa448361d9508413fe2383bc41554a2df52332e9035bb1f293bc89d0461ec
- _layout.tsx: f3362049926a3119152d21207c25049fde4725c8c739114d4093bc25aeac55dd

## Additive runtime source review

GO for qualification source; no findings. Independent inspection confirms original eight mandatory screenshots, one row/count, Add/restart/readback/logout and Edit revision2 through archived revision6 assertions remain. The only original mutations gain explicit upcoming date entry and later date erasure respectively. Two additional exact successful screenshot names are allowlisted; no failed/private screenshot or log projection is added.

The observer is owned-fixture READ ONLY with epoch fencing, exact single-row source/amount/name/date/status/revision validation, and closed count/hash/boolean output. Before-edit Home verifies fresh login, exact real-clock candidate date and amount, refresh and acknowledged logout after the parent restart. After original tracking/restart/logout, empty Home verifies fresh login, refresh and acknowledged logout; same baseline row identity and archived tracking digest must agree before success flags. A UTC-tomorrow candidate alone never claims device membership: actual installed UI must display it or qualification fails. No clock override, auth/API/SQL/grant/dependency/design adoption change is present.

Author-reported orchestration/observer tests and types/lint/syntax were not rerun. Actual installed flows, readbacks, pixels, cleanup, parent acceptance and UX adoption remain separate gates.

Verified runtime SHA-256:

- private-runtime-renewals.mjs: 4581a9b41c83b387125769a9ac86e6b7e91fbcdc44a6674b8faa824a57558d24
- private-runtime-device.mjs: f172afbaa3419dd62ce0a822ea47480f3607c5180712dba8896302ecc23c04aa
- private-mobile-renewals-receipt.ts: 7290b1401936ee41388216b2eb2f935eac868f22ab6f46c1e97644316b997007
- private-mobile-owned-fixture.ts: 859a8a0dcb69d48bdfe2dad5392803f92c8f1ca2230b0261cd9bb9334031d211
- private-runtime-renewals.yaml: bc9c6a9040fe26ffc369595e4e5b9f480042bfcc9b5884def0bb41acc4caecb0
- private-runtime-renewals-empty.yaml: 86b4a8c625f8c562890a76b0db0d20f3849264e47627b6e4743e397132d113a2
