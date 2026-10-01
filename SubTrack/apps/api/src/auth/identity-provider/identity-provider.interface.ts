/**
 * IdentityProvider — pluggable authentication backend interface.
 *
 * Implementations include:
 *  - BankIdSimulator  (dev/test: deterministic, no network calls)
 *  - BankIdRpAdapter  (staging/prod: ST-043, pending D-12)
 *
 * A provider receives an opaque `token` from the frontend (the signed BankID
 * completion token or a simulator demo ID) and returns a verified IdentityResult.
 * The caller (AuthService/SessionService) is responsible for persisting the result
 * — the provider never writes to the database.
 */
export interface IdentityResult {
  /** Authentication method used. */
  method: 'BANKID' | 'OTP' | 'MOCK';
  /** Display name from the identity source (BankID: full legal name). */
  name: string;
  /** ISO-8601 timestamp when the provider verified the identity. */
  verifiedAt: string;
  /**
   * HMAC-SHA256(personnummer, HMAC_SECRET) — keyed so the raw personnummer
   * cannot be recovered without the application secret. Used as a stable
   * deduplication key: same person → same HMAC across sessions.
   */
  personnummerHmac: string;
}

export interface IdentityProvider {
  /**
   * Verify a token and return a verified identity.
   * Must NOT contact external services (in simulator mode).
   * Throws if the token is invalid or the provider is unavailable.
   */
  verify(token: string): Promise<IdentityResult>;
}

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');
