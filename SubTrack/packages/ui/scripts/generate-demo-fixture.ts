import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { formatMinorUnits } from '@subtrack/money';
import { PERSONA_LINDQVIST } from '@subtrack/synthetic';

export type DemoLocale = 'en' | 'sv';
export type DemoFixture = {
  householdName: string;
  subscriptions: Array<{
    id: string;
    merchantName: string;
    billingCadence: 'MONTHLY' | 'ANNUAL';
    currency: string;
    amountMinor: string;
    displayAmount: Record<DemoLocale, string>;
  }>;
};

export function createDemoFixture(
  subscriptions = PERSONA_LINDQVIST.subscriptions,
  formatter: typeof formatMinorUnits = formatMinorUnits,
): DemoFixture {
  return {
    householdName: PERSONA_LINDQVIST.displayName,
    subscriptions: subscriptions.map((subscription) => {
      if (!Number.isSafeInteger(subscription.amountMinor)) {
        throw new RangeError(`Unsafe minor-unit amount for ${subscription.id}`);
      }
      const minorUnits = BigInt(subscription.amountMinor);
      return {
        id: subscription.id,
        merchantName: subscription.merchantName,
        billingCadence: subscription.billingCadence,
        currency: subscription.currency,
        amountMinor: minorUnits.toString(),
        displayAmount: {
          en: formatter(minorUnits, subscription.currency, { locale: 'en' }),
          sv: formatter(minorUnits, subscription.currency, { locale: 'sv' }),
        },
      };
    }),
  };
}

export async function generateDemoFixtureAtomically(
  destinations: string | readonly string[] = resolve(process.cwd(), 'src/generated/demo-fixture.json'),
  subscriptions = PERSONA_LINDQVIST.subscriptions,
  formatter: typeof formatMinorUnits = formatMinorUnits,
): Promise<void> {
  const fixture = createDemoFixture(subscriptions, formatter);
  for (const destination of typeof destinations === 'string' ? [destinations] : destinations) {
    const temporary = `${destination}.${process.pid}.tmp`;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
    await rename(temporary, destination);
  }
}
