# Mobile delivery plan

The user's 2026-10-13 instruction puts Android and iOS first. Web application features are deferred; the eventual website is a download gateway to verified App Store and Google Play links. Existing accepted and unfinished web source is preserved. No public release, real delivery, spending or new third-party account is authorized.

The active board now has fourteen native deliverable groups instead of a mixed 273-record execution list. The exact old board is archived. Every one of its 55 unfinished IDs is mapped once: 45 into native groups, seven into deferred web work and three into obsolete tracking. This reduces scheduling clutter; it does not reduce the remaining product requirements by the same proportion.

## Deliver first

The first native workflow is verified development login/enrollment → profile → Just me → subscription list/Add → restart/login → the same persisted subscription. Extend it with Edit/status inside bounded slices. Backend authority/storage, React Native screens/session handling, and real runtime validation run in parallel within one user-visible feature. Reuse the accepted contracts, SQL and deterministic Money behavior rather than rebuilding them.

The native audit found a genuine implementation gap: login/BankID completion currently display unavailable states, and authenticated profile/subscription routes do not exist. The working private backend uses browser cookies, chain binding, CSRF and web authority; it cannot simply be called from native fetch. The next contract must connect accepted mobile bearer-session semantics to durable current-owner transactions, preserving mandatory identity verification and revocation. Freeze and independently review that contract before source GO; do not relax the security model to make a demo work.

The first native runtime work must also repair missing icon/splash asset references and connect the configured API base URL to the client. Actual Android/iOS startup and persistence are acceptance criteria. Jest, screenshots of web routes and Expo web export do not count as device qualification. No Android SDK/Java/device tooling or Mac/Xcode was observed in the audit; obtain a verified development device/build route without inventing credentials or store accounts. A local/private development preview is distinct from store/public distribution.

Next deliverables are native Home/history, Synthetic bank sync and detection review, household/invitations, sharing/settlements, and intelligence. BankID/Tink test-provider work, device quality and release prerequisites remain explicit in the board. Synthetic integration may deliver an earlier usable flow while real-provider credentials remain unresolved. No provider blocker should stop unrelated native work.

## Remove the delay mechanisms

- Completed records leave the active board. BUG-008 and ST-028 are reconciled from accepted children; ST-050b becomes historical tracking rather than another implementation dispatch.
- Small API/storage/UI/proof pieces become internal workstreams of the same feature, with bounded contracts and independent reviews. Delivery groups are never dispatched as giant tasks.
- Productive agents do not stop merely because 20 calls, 30 minutes, a size estimate or an arbitrary checkpoint length has been reached. Genuine repeated failure, repeated review rejection, no progress, explicit user pause and resource coordination remain enforced.
- Use focused checks while source changes. Run all applicable checks at the final feature head. Repeat broad runs only after relevant changes, failures or unresolved concerns.
- Reviewers consume one exact-run paginated artifact inventory and canonical handoff. Do not reconstruct multiple partial inventories or copy entire evidence histories into every checkpoint.
- Report usable native behavior and unresolved integration/device requirements. Archived DONE records and grouped ticket counts are not product-completion percentages.

Measured accepted CI took about four minutes for quality and seven to eight minutes for the longest browser job; it does not explain weeks of elapsed delivery. The larger avoidable costs were sequential micro-delivery boundaries, stale prerequisite planning, forced context replacement and repeated evidence handling. The previous overall ETA is withdrawn until complete native slices and their runtime dependencies are estimated from actual delivery throughput.

## Historical reconciliation

ST-028's design/mock-screen scope is covered by accepted ST-057 and ST-058; this does not complete a live dashboard or native app. BUG-008's canonical migration scope is covered by BUG-008a/b and merged PR237 (`cf68ccad9562183311ebf692ad985b103e2148ef`) with actual least-privilege PG16 evidence. ST-050b's client and OTP runtime were accepted through PR230/231; its broader web residual is deferred with ST-050.

ST-170b/c remain partially implemented: provider proof, native session exchange/refresh and appropriate data-rights/session integration remain in the native account workflow. Their old inventory blockers are historical after the founder answered “none” and the canonical migration chain was accepted. Fresh native contracts must name actual residual work, not redispatch those resolved investigations.

The unfinished ST-242 filter feature remains in `st/ST-242-private-owner-filters` at the durable-authority worktree. Its source review, 2042 API tests, 199 web tests and Next build passed; its actual browser/CI/pixel acceptance was not run. It is deferred, not DONE. No more web feature work is scheduled under the current instruction.
