/**
 * DevInbox — development-only OTP delivery adapter.
 *
 * In dev/test mode, OTPs are written to stdout (visible in `pnpm dev` logs)
 * and stored in memory so integration tests can retrieve them without needing
 * an SMTP server. The last sent OTP per identifier is retrievable via peekOtp().
 *
 * DO NOT use in production — the NODE_ENV guard in OtpService prevents this.
 */

const inbox = new Map<string, string>();

export function devInboxSend(identifier: string, code: string): void {
  inbox.set(identifier, code);
  // Print in a format easy to grep in dev logs.
  process.stdout.write(`[DevInbox] OTP for ${identifier}: ${code}\n`);
}

/** Retrieve the last code sent to an identifier. Test helper only. */
export function peekOtp(identifier: string): string | undefined {
  return inbox.get(identifier);
}

/** Clear all stored codes. Call in test afterEach. */
export function clearInbox(): void {
  inbox.clear();
}
