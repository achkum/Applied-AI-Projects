# Native integration review — in progress

Android/iOS source is not accepted yet. Runtime/config/assets have independent source approval; actual installed native execution and PostgreSQL proofs remain pending.

Root found a concrete client/server mismatch: native generic POST adds Idempotency-Key on all operations, but private HTTP rejects that header on profile, mode, list and logout. Native author is correcting operation-specific headers and adding request assertions. Backend proof must exercise those real client-shaped requests through HTTPS rather than mocking only responses.

Native correction handoff: all 12 focused tests passed (seven mounted screen tests and five API-wire tests), plus mobile typecheck, full lint and catalog parity. Required keys now appear only on completion/login/session/refresh/Add; business/logout omit them. Refresh has no body or Content-Type. Authoritative profile reads apply language/theme through existing providers with stale-response guards. The technical rotation control is removed; defensive category rendering does not widen the closed server decoder. Session Core is unchanged from its prior coverage result. Independent native client/design source review is dispatched; these are author-reported source checks, not installed app acceptance.

Corrected API SHA256: `fe89f2d1b80755f670c1f4c6825c8c08bd48a2930179ff579aede0d53d849099`. Corrected screen SHA256: `865308af67a9e350f15dcaceb2ded3232d2846085b4113e50d0839b990b4826c`.

Root and independent security review found refresh sends/requires `{}` while accepted refresh semantics forbid a body. Both authors are aligning the private route to bodyless Refresh authorization. Stable session ID across refresh is consistent with accepted family semantics and is not a defect.

Native profile preferences were only saved/displayed in form state. Native author is applying authoritative language/theme rereads through existing providers, removing the visible technical session-rotation action, and handling legacy category fallback. Session rotation remains covered internally.

Independent security review requires removing caller-selected development identity from login verification, final refresh authority/expiry recheck before commit, narrowing SQL015 session update privileges to mutable columns, removing unused verified-contact read privilege, and preserving required verified identity metadata. Backend author is addressing these before final source approval.

The early security review is HOLD, not final approval. It also requires preserving a typed generic 409 for duplicate reservation keys after known rollback; current transaction wrapping turns that business denial into 500. Storage/commit uncertainty must remain generic 500 without credentials. Early review found known-commit ordering and producer admission boundaries sound at its snapshot; final corrected source still needs independent delta review.

Actual qualification route: existing public GitHub repository, standard hosted Linux Android emulator and macOS iOS simulator. Runtime has a separate exact roster for native workflow, scripts, debug-only CA plugin and local flows; backend retains PostgreSQL/API launcher and its own workflow. No new accounts, paid runners, EAS submission, real provider delivery or public endpoint is needed. Toolchain compatibility and actual installed workflow are still unproven.

Runtime implementation dispatched in parallel as native_runtime_qualification. Backend and runtime must coordinate the actual launcher/CA/fixture/restart interface directly; scaffold native compilation now rather than waiting for all backend tests.

Next acceptance evidence must join the same source head across client, server, SQL and installed native builds: verification, profile, Just me, Add, restart/fresh verified login and the same stored subscription; logout denial, refresh rotation/reuse, fail-closed storage and sanitized screenshots/receipts. Fresh login after startup is explicit for this first slice; automatic session restoration is not implemented.
