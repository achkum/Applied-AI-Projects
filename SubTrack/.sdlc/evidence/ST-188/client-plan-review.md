# ST188 client plan review

**Decision: APPROVE**
**Classification: Type 2a contract alignment; no Type 1 decision is introduced.**

The proposed web session nonce requirement implements the accepted ADR-0010 browser security model. The contract already defines the reusable `BrowserNonce` (`X-Browser-Nonce`) parameter and public `BrowserNonce`/binding-cookie chain, while the session operation currently declares only idempotency and Origin and `WebSessionHeaders` omits the nonce. Requiring that existing value for the web session envelope closes a contract omission; it does not change the security model. Keep the OpenAPI operation parameter declaration aligned with the envelope and describe the requirement as web-conditional, since OpenAPI cannot express a parameter required only for one request discriminator by itself.

## Required contract constraints

- Web session redemption carries `Idempotency-Key`, browser-supplied exact-allowlisted `Origin`, and the current public `X-Browser-Nonce`; the nonce must be paired server-side with the distinct HttpOnly binding cookie. Do not accept cookie-only validation or invent a cookie lookup/provider seam.
- Consume the nonce atomically with successful web login-proof redemption. The proof must be one-use, web-transport-bound, and bound to the same browser chain. Preserve the existing strict Origin and idempotency requirements.
- A successful web response transitions the client to the distinct session-bound CSRF token and session cookies. It must not return a `nextBrowserNonce`; that nonce has been consumed, and the CSRF token is for subsequent unsafe session calls.
- If the one-use session response is lost, retries/duplicates return generic `409 AUTH_RESTART_REQUIRED` without credentials. The client discards unavailable local session state and performs fresh verified login from a fresh nonce chain. Do not attempt to recover by replaying the proof or nonce.
- Mobile continues to send only `Idempotency-Key` for this session request, with a mobile-bound proof. Its envelope rejects browser nonce, Origin, and CSRF fields. V1 paths and behavior remain unchanged.
- Regenerate generated SDK/Zod artifacts with the pinned generator and update contract tests. Stay within the plan's allowed paths and retain the contract-only boundary; no runtime readiness claim or source/config/schema/provider work belongs in this slice.

## Call count

The session exchange itself is **one POST** to `/v2/auth/session`. In a normal web flow, the nonce is already obtained or advanced by the existing browser nonce/OTP proof chain, so this correction adds **zero extra HTTP calls** to that flow. If the client has no usable nonce chain, it must obtain a fresh nonce and complete fresh verified login before the one session POST; those upstream calls depend on the login method and are not defined by this contract change. After a lost session response, fresh verified login and session redemption are required; there is no fixed total across BankID/passkey/OTP providers, and no replay call is valid. Do not present a speculative end-to-end count as fixed.

The contract and ADR support these semantics: ADR-0010 requires a public one-use browser nonce paired with a distinct HttpOnly binding cookie, separate session CSRF, and fresh-chain/challenge recovery for lost one-use responses. Current OpenAPI session parameters and web header schema are the identified gap. The inspected contract tests currently accept web session headers without a nonce, reject missing Origin, and keep mobile headers restricted; they should be updated to assert the new web-only condition and unchanged mobile envelope.
