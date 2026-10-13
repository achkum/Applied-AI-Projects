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
