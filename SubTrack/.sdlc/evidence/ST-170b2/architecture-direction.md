# ST-170b2 architecture: restricted OTP proof producer

## Decision

**Approve this bounded internal slice**, with the repository interface as the trust boundary. Do not build on the existing v1 `OtpService.verifyOtp`: it looks up by identifier rather than challenge ID, returns only `{ verified: true }`, and performs a read followed by an unconditional update. That cannot establish that the requested v2 challenge was verified exactly once or safely supply the server-owned fields that `ProofStore` needs.

The accepted `/v2/auth/otp/verify` contract returns a five-minute restricted proof after OTP verification. For `enroll_identifier`, that proof authorizes only mandatory BankID continuation. It does not create an account, identity, login proof, or session. `otp_step_up` maps to a `stepup` proof. Never issue `login` from OTP.

## Small implementation boundary

Add an internal producer that accepts only a challenge ID, submitted code, and verified transport context. It loads the challenge from an explicit `OtpChallengeRepository` and atomically verifies-and-consumes it. The repository result is a trusted immutable record containing the server-owned purpose, challenge ID, already-normalized identifier SHA-256 hash, channel, transport, expiry, attempts/lock state, code digest, and (for web) the exact origin and browser-chain binding established by the server. Provisioning accepts the normalized identifier hash, not the raw identifier; normalization, HTTP start and delivery remain separate work. The caller cannot pass purpose, identifier, identity, or proof bindings during verification.

The repository operation should have one operation boundary, such as `verifyAndConsume({ challengeId, codeDigest, transportContext, now })`, and return either the consumed trusted challenge record or one generic failure. It must compare challenge ID, code hash, expiry, lock/attempt limit, and transport/browser binding and consume successful challenges atomically. Failed attempts must increment atomically and lock at five attempts; malformed, missing, expired, locked, mismatched, or already-consumed challenges all map to the same outward failure. Compare fixed-size code digests using constant-time comparison (for example, `timingSafeEqual`). No raw code or identifier in errors/logging. Use a server-keyed, domain-separated code digest; a plain salted SHA-256 of a six-digit value is cheaply enumerable after a database leak.

After and only after that atomic success, map stored purpose to `ProofStore` purpose (`enroll_identifier` → `enrollment`; `otp_step_up` → `stepup`) and issue the proof using the repository record's challenge, transport, identifier hash and browser bindings. Never accept a caller-supplied `ProofBinding`. Existing `ProofStore` validates those bindings and stores only a hash of the proof. Do not issue identity-bound or session-bound fields for this OTP slice.

Supply a concrete in-memory dev/test repository that performs digest comparison, expiry/context checks, bounded attempt increments and lockout, and successful consumption atomically (no await between compare and state mutation). Test those behaviors directly; a verifier interface alone is insufficient. Do not wire it as a production runtime store or claim production readiness. No HTTP controller, provider, session flow, account creation, delivery claim, Prisma/schema/migration change, or new dependency belongs in this task. `apps/api/package.json` has no contracts package dependency, so do not add one; use the narrow internal types and preserve the contract mapping in comments/specs.

## Required focused tests

- Correct code on a stored enrollment challenge issues an opaque `enrollment` proof bound to the stored challenge, identifier hash and selected transport; a web challenge also retains its server-established origin and browser-chain binding.
- Step-up maps only to `stepup`; caller input cannot select a different purpose, challenge, identifier hash, or browser binding.
- Wrong, expired, locked, transport-mismatched, missing and replayed challenges fail generically and issue no proof; attempts/lockout remain bounded.
- Two concurrent attempts to verify one challenge yield at most one consumed record and one proof.
- Proof redemption with changed purpose/challenge/transport/browser binding fails and a valid redemption succeeds only once.

## Gate for later wiring

The existing `OtpChallenge` Prisma model lacks purpose, channel, transport, browser-chain/origin binding, and a v2 atomic conditional-consume method. Therefore this task must define and exercise the repository seam plus the in-memory reference without adapting the current Prisma service. A later persistence/wiring task needs its own database inventory, schema/security review, and atomic implementation. The in-memory implementation is not production persistence. The existing OTP delivery service is dev-only and must not be treated as proof of OTP delivery or provider readiness.
