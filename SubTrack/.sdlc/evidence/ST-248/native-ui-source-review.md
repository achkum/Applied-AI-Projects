# ST-248 native bank UI source review

Independent platform source verdict: **GO** for the native Synthetic bank client and screen. This review covers the current source only; installed Android/iOS and PostgreSQL acceptance remain pending.

The screen uses the adopted native theme roles and the existing verified session, profile-complete, and Just-me gates. It offers explicit Synthetic connect, repeatable sync, current saved counts and last-sync, retained disconnect, fresh-generation reconnect, and a separate confirmed purge. Purged generations disappear from the retained read list; the successful mutation plus subsequent read produces a bounded removal acknowledgement. No real-provider choice, owner selector, raw transactions, or automatic subscription creation is exposed.

The client uses the fixed private HTTPS Bearer routes and strict contract parsers, a fresh UUID key per explicit mutation, bounded response/deadline checks, and a current-authority read after each mutation or known conflict. It does not retry an uncertain mutation. Focus/session generation guards abort obsolete work, hide owner data on retirement/logout, and prevent a late result from replacing a current read. The new personal navigation entry is visible only with the existing completed Just-me profile gate.

I found no source blocker in this native delta. Author-reported API and mounted tests, typecheck, and lint were not rerun here. The backend qualifier's separate authenticated second-owner gap is outside this UI verdict and must be resolved before overall ST-248 acceptance.
