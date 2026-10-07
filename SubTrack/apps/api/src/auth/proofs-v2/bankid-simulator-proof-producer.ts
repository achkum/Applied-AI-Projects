import { randomBytes } from 'node:crypto';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import type { IdentityResult } from '../identity-provider/identity-provider.interface';
import { ProofStore, type ProofBinding } from './proof-store';
import type { VerifiedTransportContext } from './otp-proof-producer';

const FAILURE = 'Simulator proof unavailable';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface RegisteredSimulatorIdentityResolver {
  resolveRegisteredIdentityId(personnummerHmac: string): Promise<string | null> | string | null;
}

export interface DevelopmentSimulatorLoginProofProducerOptions {
  readonly environment: string;
  readonly enabled: boolean;
  readonly simulatorHmacKey: Uint8Array;
  readonly identityResolver: RegisteredSimulatorIdentityResolver;
  readonly proofStore: ProofStore;
  readonly clock?: () => number;
}

function snapshotDataObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(FAILURE);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') throw new Error(FAILURE);
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error(FAILURE);
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function copyContext(value: unknown): VerifiedTransportContext {
  const context = snapshotDataObject(value);
  if (context.transport === 'web') {
    if (Object.keys(context).some((key) => key !== 'transport' && key !== 'exactOrigin' && key !== 'browserChainId') ||
      typeof context.exactOrigin !== 'string' || !context.exactOrigin || context.exactOrigin !== context.exactOrigin.trim() ||
      typeof context.browserChainId !== 'string' || !context.browserChainId) throw new Error(FAILURE);
    let origin: URL;
    try { origin = new URL(context.exactOrigin); } catch { throw new Error(FAILURE); }
    if (origin.protocol !== 'https:' || origin.origin !== context.exactOrigin || origin.hostname.includes('*')) throw new Error(FAILURE);
    return Object.freeze({ transport: 'web', exactOrigin: context.exactOrigin, browserChainId: context.browserChainId });
  }
  if (context.transport === 'mobile' && Object.keys(context).length === 1) return Object.freeze({ transport: 'mobile' });
  throw new Error(FAILURE);
}

function validateResult(value: unknown, now: number): Readonly<Pick<IdentityResult, 'method' | 'personnummerHmac' | 'verifiedAt'>> {
  const result = snapshotDataObject(value);
  if (result.method !== 'BANKID' || typeof result.personnummerHmac !== 'string' || !/^[a-f0-9]{64}$/.test(result.personnummerHmac) ||
    typeof result.verifiedAt !== 'string') throw new Error(FAILURE);
  const timestamp = new Date(result.verifiedAt);
  const verifiedAt = timestamp.getTime();
  if (!Number.isFinite(verifiedAt) || timestamp.toISOString() !== result.verifiedAt || verifiedAt > now || now - verifiedAt > 5 * 60 * 1000) throw new Error(FAILURE);
  return Object.freeze({ method: 'BANKID', personnummerHmac: result.personnummerHmac, verifiedAt: result.verifiedAt });
}

/** Internal development reference. Keep unregistered: no barrel or runtime wiring. */
export class DevelopmentSimulatorLoginProofProducer {
  private readonly simulatorKeyHex: string;
  private readonly clock: () => number;

  constructor(private readonly options: DevelopmentSimulatorLoginProofProducerOptions) {
    if (options.environment !== 'development' || options.enabled !== true || !(options.simulatorHmacKey instanceof Uint8Array) ||
      options.simulatorHmacKey.byteLength < 32 || !options.identityResolver || !options.proofStore) throw new Error(FAILURE);
    const copiedKey = Buffer.from(options.simulatorHmacKey);
    if (copiedKey.length < 32) throw new Error(FAILURE);
    // Hex is a reversible representation for the simulator's string-key API.
    this.simulatorKeyHex = copiedKey.toString('hex');
    this.clock = options.clock ?? Date.now;
  }

  async issue(contextInput: VerifiedTransportContext): Promise<string> {
    try {
      const context = copyContext(contextInput);
      const now = this.clock();
      if (!Number.isSafeInteger(now) || now < 0) throw new Error(FAILURE);
      const simulator = new BankIdSimulator(this.simulatorKeyHex);
      const providerResult = await simulator.verify('alice');
      const verifiedAtNow = this.clock();
      if (!Number.isSafeInteger(verifiedAtNow) || verifiedAtNow < 0) throw new Error(FAILURE);
      const result = validateResult(providerResult, verifiedAtNow);
      const identityId = await this.options.identityResolver.resolveRegisteredIdentityId(result.personnummerHmac);
      if (typeof identityId !== 'string' || !UUID.test(identityId)) throw new Error(FAILURE);
      const issueNow = this.clock();
      if (!Number.isSafeInteger(issueNow) || issueNow < 0) throw new Error(FAILURE);
      validateResult(result, issueNow);
      const binding: ProofBinding = Object.freeze({
        purpose: 'login',
        challenge: randomBytes(32).toString('base64url'),
        transport: context.transport,
        identityId,
        ...(context.transport === 'web' ? { exactOrigin: context.exactOrigin, browserChainId: context.browserChainId } : {}),
      });
      return await this.options.proofStore.issue(binding);
    } catch {
      throw new Error(FAILURE);
    }
  }
}
