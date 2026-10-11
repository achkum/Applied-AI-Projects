import { BankIdSimulator, DEVELOPMENT_ENROLLMENT_PERSON, type DevelopmentEnrollmentPersonResult } from './bankid-simulator';

const FAILURE = 'Development enrollment person unavailable';
const MAX_TIME = 8_640_000_000_000_000;
const MAX_AGE = 300_000;
export interface DevelopmentEnrollmentPersonVerifierOptions {
  readonly environment: string;
  readonly enabled: boolean;
  readonly simulatorHmacKey: Uint8Array;
  readonly clock?: () => number;
}

function snapshot(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(FAILURE);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new Error(FAILURE);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error(FAILURE);
    result[key] = descriptor.value;
  }
  return result;
}

/** Unregistered development prerequisite; has no proof, identity or session authority. */
export class DevelopmentEnrollmentPersonVerifier {
  private readonly keyHex: string;
  private readonly clock: () => number;
  private lastTime = -1;

  constructor(options?: DevelopmentEnrollmentPersonVerifierOptions) {
    try {
      const input = snapshot(options);
      if (Object.keys(input).some((key) => !['environment', 'enabled', 'simulatorHmacKey', 'clock'].includes(key)) ||
        input.environment !== 'development' || input.enabled !== true || !(input.simulatorHmacKey instanceof Uint8Array) ||
        input.simulatorHmacKey.byteLength < 32 || (input.clock !== undefined && typeof input.clock !== 'function')) throw new Error(FAILURE);
      const copiedKey = Buffer.from(input.simulatorHmacKey);
      if (copiedKey.length < 32) throw new Error(FAILURE);
      this.keyHex = copiedKey.toString('hex');
      this.clock = input.clock === undefined ? Date.now : input.clock as () => number;
    } catch { throw new Error(FAILURE); }
  }

  private readTime(): number {
    const now = this.clock();
    if (!Number.isSafeInteger(now) || now < 0 || now > MAX_TIME || now < this.lastTime) throw new Error(FAILURE);
    this.lastTime = now;
    return now;
  }

  async verify(): Promise<Readonly<DevelopmentEnrollmentPersonResult>> {
    try {
      if (arguments.length !== 0) throw new Error(FAILURE);
      const started = this.readTime();
      const raw = await new BankIdSimulator(this.keyHex).verify(DEVELOPMENT_ENROLLMENT_PERSON.token);
      const now = this.readTime();
      if (now - started > MAX_AGE) throw new Error(FAILURE);
      const result = snapshot(raw);
      if (Object.keys(result).length !== 4 || result.method !== 'BANKID' ||
        result.name !== `${DEVELOPMENT_ENROLLMENT_PERSON.givenName} ${DEVELOPMENT_ENROLLMENT_PERSON.surname}` ||
        typeof result.personnummerHmac !== 'string' || !/^[a-f0-9]{64}$/.test(result.personnummerHmac) ||
        typeof result.verifiedAt !== 'string') throw new Error(FAILURE);
      const verified = new Date(result.verifiedAt);
      const at = verified.getTime();
      if (!Number.isSafeInteger(at) || at < 0 || at > now || now - at > MAX_AGE || verified.toISOString() !== result.verifiedAt) throw new Error(FAILURE);
      return Object.freeze({ method: 'BANKID', personnummerHmac: result.personnummerHmac, verifiedAt: result.verifiedAt,
        givenName: DEVELOPMENT_ENROLLMENT_PERSON.givenName, surname: DEVELOPMENT_ENROLLMENT_PERSON.surname });
    } catch { throw new Error(FAILURE); }
  }
}
