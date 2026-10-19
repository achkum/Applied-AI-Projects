# ST249 VERIFY_LOGIN500 causal diagnosis and bounded repair proposal

2026-10-14. Read-only source investigation following actual e3be79a run38536219151 closed diagnostic VERIFY_LOGIN expected200 actual500. Six stable same-image source files remain untouched. No tests, SQL, Docker, dispatch, Git or raw private logs were read/executed in this investigation.

## Deterministic cause

Owned detection setup enables its reviewed controlled clock to PostgreSQL wall time minus3600000ms, then starts the graph and asks for a fresh login. The server correctly supplies this same clock to DevelopmentEnrollmentPersonVerifier and PrivateMobileSubjectVerifier. However, DevelopmentEnrollmentPersonVerifier constructs BankIdSimulator with only its key. BankIdSimulator stamps synthetic verifiedAt using new Date().toISOString(), independently reading host wall time. Thus the actual unmocked simulator produces a timestamp about one hour later than the controlled verifier's now.

DevelopmentEnrollmentPersonVerifier intentionally rejects at>now (future evidence) and catches that failure as its fixed unavailable Error. This happens inside subjects.verify before DurablePrivateMobileSessions.reserve, so no login SQL can repair it. The mobile HTTP handler maps that fixed unavailable error to500, matching the actual diagnostic. The unchanged parent/bank baselines use wall clock and pass; existing verifier units align global fake time with injected time, masking this mismatch. Epoch policy is not the cause: its source allows observed<=PGwall, and no epoch transaction is reached before simulator rejection.

Relevant source: owned-fixture-observer.ts enable(pgNow) assigns pgNow−3600000; private-mobile-server.ts passes clock to verifier/subject; development-enrollment-person-verifier.ts verify constructs simulator without clock and checks future time; bankid-simulator.ts verify stamps new Date(); durable-mobile-sessions.ts verifyLogin first awaits subjects.verify; private-mobile-http.ts generic unavailable maps500.

## Proposed exact narrow source freeze

- SubTrack/apps/api/src/auth/identity-provider/bankid-simulator.ts
- SubTrack/apps/api/src/auth/identity-provider/bankid-simulator.spec.ts
- SubTrack/apps/api/src/auth/identity-provider/development-enrollment-person-verifier.ts
- SubTrack/apps/api/src/auth/identity-provider/development-enrollment-person-verifier.spec.ts

Optional fifth existing private-mobile/verified-subject-binding.spec.ts only if independent review requires an actual full subject-binding regression; no runtime factory/SQL/fixture/controller/qualifier/receipt edits proposed.

Add a trusted constructor-only simulator clock, default ()=>Date.now() so legacy caller/default wall behavior stays unchanged. Reject nonfunction clock. Use that clock to stamp the simulator's original verifiedAt at issuance, then pass ()=>this.readTime() from DevelopmentEnrollmentPersonVerifier, preserving its existing finite/monotonic Date-safe readTime checks around and during the actual simulator call. No posthoc timestamp rewriting, fabricated evidence, global Date patch in the owned fixture, runtime/client/env clock flag or alternate simulator/provider is accepted.

Keep HMAC/key copying, fixed names/identity selector, proof/subject derivation, BANKID method, private development gates, before/after freshness/future/age checks, subject TTL, session/epoch/time guards, baseline order and all receipt flags unchanged. Production/public sandbox implementation remains untouched; ordinary simulator callers still get wall time. The clock is existing trusted graph configuration, not a client assertion.

Meaningful focused regression: actual unmocked simulator/verifier with injected clock one hour behind real host wall time must issue exact controlled timestamp and valid fixed identity while host Date.now remains real; future/stale/throwing/regressing evidence/time cases still deny. Explicit simulator-clock case proves HMAC/name/case/result shape unchanged and default simulator timestamp remains within real wall bracket. No SQL fixture outcome is mocked. After source/path approval, focused changed-source tests/types/lint plus independent platform/privacy source review precede one new-head causal PG run; no blind e3 rerun.