# ST170 candidate v2 — independent security review

**Verdict: APPROVE_PROPOSAL.** The previous High findings are resolved in this revision. This is approval of a written `/v2` wire proposal only; it does not approve runtime behavior, implementation, deployment, rollout, or certify existing controls.

## Finding counts

- Critical: 0
- High: 0
- Medium: 0
- Low: 0

## Previously reported High findings

- **OTP login versus enrollment — resolved.** The proposal follows UF-01: OTP verifies the identifier before mandatory BankID enrollment, and the enrollment proof only permits that continuation. OTP alone cannot create a principal or login. Existing-user login requires verified BankID or the stated server-verified registered mobile passkey/biometric assertion plus OTP.
- **Deletion proof purpose, principal, and issuance — resolved.** Production deletion requires recent BankID reauthentication. In development, authenticated `/v2/me/reauth/otp/start` uses the caller's registered identifier from server-owned session context; verification is restricted to the same principal/session and returns a deletion-only proof. Both endpoints enforce explicit development mode and `AUTH_DELETE_OTP_DEV_ONLY`; the client cannot select environment, identity, or method. The final delete also requires the current authenticated principal/session, and web Origin/CSRF checks; proof is independently consumed atomically.
- **Browser nonce issuance and binding — resolved.** The proposal defines a POST bootstrap, public JSON nonce plus a distinct host-only HttpOnly binding cookie, exact allowlisted Origin, purpose/challenge chain, rotation, and rejection of replay/mismatch/null Origin/wildcard/reflected credentialed CORS. Session CSRF is separate, session-bound, readable by the same-origin web client, returned at initial web session creation and refresh, and rotated with lifecycle.
- **Mobile refresh transport — resolved.** Mobile refresh uses only `Authorization: Refresh <opaque-secret>`; web refresh uses its cookie. Refresh rejects bodies, rotates within the selected transport, and responses are no-store. Protected mobile requests use Bearer access JWT.
- **Transport ambiguity and `/v1` isolation — resolved.** The candidate explicitly selects transport, disallows mixed credentials and fallback, separates v2 auth and token namespace, and preserves v1 pending deployment/consumer inventory without claiming rollout safety.

## Scope and implementation gates

The proposal keeps BankID provider protocols out of scope and names proof-producer integration as a required separate ST170b slice before session exchange is client-ready. It makes no provider-correctness or deployment claim. Schema work remains gated on database inventory; RLS verification is limited to a disposable PostgreSQL instance and a qualified role. These are implementation gates, not unresolved High findings against this proposal.

Review accounting: five `functions.exec` wrappers and five nested tool calls across the initial review and this re-review.
