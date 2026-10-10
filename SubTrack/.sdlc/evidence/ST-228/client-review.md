# ST-228 independent client architecture review
Verdict: APPROVE planning only; no blocker/major finding; no UI, runtime, schema or durable-account completion acceptance.
Frozen Git blobs verified: ADR0026 `5ce4945a594e68b7aba47308f514d8bdfff040c7`; 20-line transaction plan `5ca879c949cbce10eae22fe61587c2161c575bc4`.
Read AGENTS/task/source-pins, Constitution/DECISION_RULES/QUALITY_GATES/OPERATING_MODEL, UF01, ADR0010/0020/0025, ST050b/c/ST211 and current registration-api.ts.
Contracts-first C precedes storage/access S, async account A, durable sessions D, isolated HTTPS H and web account/profile W; each later slice has explicit paths/dependencies and its own acceptance.
Future web OTP remains restricted identifier authority; a bounded server-owned continuation and separately verified simulator enrollment record preserve mandatory BankID without client identity selectors or proof-purpose conversion.
Trusted simulator names/contact metadata require reviewed server extensions; existing seeded login producers and process-local sessions cannot establish new-user signup or UF01 completion.
Enrollment-to-session nonce transition is explicitly future contracted, same-chain/HttpOnly-binding-cookie/authoritative-record bound, with terminal consumption; current OTP successor nonce is not already a session-purpose nonce.
New subjects receive one atomic identity/session/default-profile commit; registered-subject conflicts offer explicit later verified login, with no contact reassignment, profile overwrite or enrollment session; deleted/conflicting subjects fail generically.
Profile display/avatar/language/theme defaults remain contract reviewed; owner-scoped Just me creates no household/member/consent. Native completion and household remain separate.
Burned idempotency keys, generic duplicate409, rollback and uncertain-commit/lost-response semantics require fresh verified login/nonce rather than credential replay, automatic enrollment retry or destructive compensation.
Promise ports and immutable snapshots plus post-await clock/binding/current-owner checks support durable adapters; mutation-locked session/CSRF checks close revocation races rather than relying on client or cached identity state.
Same-epoch restart may resume persisted authority; reload loses in-memory CSRF and requires reviewed exact-Origin/current-session/cookie-bound replacement, otherwise fresh verified login. No plaintext reconstruction or CSRF bypass.
W must preserve generated-contract decoding, bounded status/media/body validation, in-memory handles, abort/late-response/back/reset guards and real browser-managed Origin/cookies; ST050b/c prove only their existing OTP slice.
Later W acceptance requires sv/en, light/dark, approved tokens, labels/focus/contrast and natural-browser conflict/reload/lost-response coverage; no UI activation follows from this review.
Security classification remains pre-schema: freeze exact auth-state/credential-owner lookup SQL permissions; planning Type2a approval grants no lookup authority, and any concrete security-model delta requires its specific founder Type1 gate.
Minor later contract follow-up: consumed-refresh reuse after CSRF rotation needs exact predecessor/current CSRF comparison and family-revocation tests, as identified by security review; no planning blocker.
Documentation review only; no runtime tests or completion claim. Original2026-10-10T23:18:19Z attempt1 M120 preserved; no source/status/backlog/commit edits.
