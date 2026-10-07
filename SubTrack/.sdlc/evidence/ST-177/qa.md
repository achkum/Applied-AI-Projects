# ST-177 QA

Final source passed declared API test/lint/typecheck on 2026-10-07: 366 tests across24files, zero failed/skipped. Earlier targeted HTTPS/config/failure checks passed51tests across3files. API build passed before the final rate-clock rollback guard delta; final typecheck includes that delta. Exact-head CI/build remains required.

Actual Nest HTTPS checks bootstrap/start/verify, exact shapes, restricted enrollment/step-up proof context and one-use consumption, SMS normalization, wrong codes, chain mismatch, raw duplicate/missing headers, extra fields/mobile rejection, replay/no secrets, disabled404 and production/test startup rejection. Injected settlement failures expose no challenge/proof/next nonce/new code and clear consumed code metadata. Tests cover nonconsuming preflight, expiry, bounded challenge/proof/code stores, sliding rate expiry/capacity, direct socket IP despite spoofed forwarding/mapped IPv4, identifier windows and rollback.

Default-off, development-only, four distinct decoded HMAC keys. Process-local state resets on restart. No provider delivery/code retrieval route, identity/session creation, durable persistence, production rollout or native validation claim. ST174 deferred; parentsST170b/c incomplete.

Conductor grants >600-line coupled-task exception: both OTP routes share nonce/idempotency/proof transaction boundaries, and their required fault/HTTPS/security tests and evidence form one bounded task. No unrelated feature included.

Exact-head CI and squash merge pending. Raw legacy v1 suite OTP prints remain outsideGit; raw logs are not committed.

Final fixture-only change replaced two scanner-flagged fictional idempotency IDs with randomUUID values; the affected registered HTTPS suite passed8tests afterward. Staged gitleaks PASS with zero findings and no new allowlist. Runtime source is unchanged from the366-test full API run.
