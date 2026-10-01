import { createHmac } from 'node:crypto';
import type { IdentityProvider, IdentityResult } from './identity-provider.interface';

/**
 * Fixed demo identities for the BankID simulator.
 * Token = demo ID string (e.g. "alice", "bob").
 * Personnummer is fictional (Luhn-valid format, not real Swedish PINs).
 */
const DEMO_IDENTITIES: Record<string, { name: string; personnummer: string }> = {
  alice: { name: 'Alice Andersson', personnummer: '199001012391' },
  bob:   { name: 'Bob Bergström',   personnummer: '198505054512' },
  carol: { name: 'Carol Carlsson',  personnummer: '200203037890' },
};

export class BankIdSimulator implements IdentityProvider {
  constructor(private readonly hmacSecret: string) {}

  async verify(token: string): Promise<IdentityResult> {
    const demo = DEMO_IDENTITIES[token.toLowerCase()];
    if (!demo) {
      throw new Error(
        `BankID simulator: unknown demo token "${token}". ` +
        `Valid tokens: ${Object.keys(DEMO_IDENTITIES).join(', ')}`,
      );
    }

    const personnummerHmac = createHmac('sha256', this.hmacSecret)
      .update(demo.personnummer)
      .digest('hex');

    return {
      method:           'BANKID',
      name:             demo.name,
      verifiedAt:       new Date().toISOString(),
      personnummerHmac,
    };
  }
}
