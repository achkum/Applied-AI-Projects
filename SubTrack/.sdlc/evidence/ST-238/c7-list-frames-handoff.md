# ST-238 C7 populated list visual evidence handoff

Source base: frozen C6 HEAD `60b7fd3707cf4e1a2d8ef172907dd020d1461ec8`. The independent C6 client/design review held only the populated list, pagination and focused-row visual evidence. C6 execution passed, but its screenshots did not contain these states.

The browser driver now captures three full-page PNGs using its existing awaited `capture` helper in each `subscriptions` and `uncertainty` case:

- `owner-list-first-page.png`: immediately after the existing 50-list-item assertion, before activating Load more.
- `owner-list-loaded.png`: immediately after the existing wait for 51 row buttons and assertion that Load more is gone.
- `focused-owner-row.png`: immediately after the existing active-element assertion for the first row, before Enter opens detail.

The labels contain no credentials or row identifiers. Screenshot write failure rejects the awaited capture and fails the browser case. The existing `subscriptions/*.png` workflow artifact wildcard includes all three PNGs for every locale/theme variant; no workflow change is needed. The capture helper's full-page setting and every existing assertion, fixture, timeout, runtime path and cleanup remain unchanged.

This is source-only evidence preparation. No C7 browser execution or screenshot pixel review is claimed here. The next gate is independent review of this proof-only diff before any push, then fresh exact-head C7 CI/actual execution and client/design inspection of the generated list frames. The original source1 deadline remains `2026-10-11T20:41:13.258Z`.
