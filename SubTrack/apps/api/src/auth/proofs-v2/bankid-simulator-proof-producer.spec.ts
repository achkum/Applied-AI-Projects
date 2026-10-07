import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from '../identity-provider/bankid-simulator';
import { InMemoryProofRepository, ProofStore, type ProofBinding, type ProofRepository, type StoredProof } from './proof-store';
import { InMemoryOtpChallengeRepository, OtpProofProducer, type VerifiedTransportContext } from './otp-proof-producer';
import { DevelopmentSimulatorLoginProofProducer, type DevelopmentSimulatorLoginProofProducerOptions } from './bankid-simulator-proof-producer';

const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const KEY = new Uint8Array(32).fill(7);
const ID = '123e4567-e89b-42d3-a456-426614174000';
const web = { transport: 'web', exactOrigin: 'https://app.example', browserChainId: 'chain-a' } as const satisfies VerifiedTransportContext;
const mobile: VerifiedTransportContext = { transport: 'mobile' };
const FAILURE = 'Simulator proof unavailable';
const originalVerify = BankIdSimulator.prototype.verify;

function setup(overrides: Partial<DevelopmentSimulatorLoginProofProducerOptions> = {}) {
  const delegate = new InMemoryProofRepository();
  const records: StoredProof[] = [];
  const repository: ProofRepository = {
    insert: (record) => { records.push(record); delegate.insert(record); },
    compareAndConsume: (hash, expected, now) => delegate.compareAndConsume(hash, expected, now),
  };
  const proofStore = new ProofStore(repository, () => NOW);
  const resolveRegisteredIdentityId = vi.fn(() => ID);
  const producer = new DevelopmentSimulatorLoginProofProducer({
    environment: 'development', enabled: true, simulatorHmacKey: KEY,
    identityResolver: { resolveRegisteredIdentityId }, proofStore, clock: () => NOW, ...overrides,
  });
  return { producer, proofStore, resolveRegisteredIdentityId, records };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { BankIdSimulator.prototype.verify = originalVerify; vi.restoreAllMocks(); vi.useRealTimers(); });

describe('DevelopmentSimulatorLoginProofProducer', () => {
  it('fails closed for environment, enablement, and short keys', () => {
    const base = { environment: 'development', enabled: true, simulatorHmacKey: KEY,
      identityResolver: { resolveRegisteredIdentityId: () => ID }, proofStore: new ProofStore(new InMemoryProofRepository()) };
    for (const change of [{ environment: 'test' }, { environment: 'production' }, { enabled: false }, { enabled: undefined }, { simulatorHmacKey: new Uint8Array(31) }]) {
      expect(() => new DevelopmentSimulatorLoginProofProducer({ ...base, ...change } as DevelopmentSimulatorLoginProofProducerOptions)).toThrow(FAILURE);
    }
  });

  it('validates strict context before simulator or resolver work', async () => {
    const f = setup();
    const verify = vi.spyOn(BankIdSimulator.prototype, 'verify');
    await expect(f.producer.issue({ ...web, extra: 'x' } as VerifiedTransportContext)).rejects.toThrow(FAILURE);
    await expect(f.producer.issue({ transport: 'mobile', exactOrigin: 'https://app.example' } as VerifiedTransportContext)).rejects.toThrow(FAILURE);
    expect(verify).not.toHaveBeenCalled();
    expect(f.resolveRegisteredIdentityId).not.toHaveBeenCalled();
  });

  it('rejects getters, symbols, hidden fields and prototype-shaped extras without invoking dependencies', async () => {
    const f = setup();
    const verify = vi.spyOn(BankIdSimulator.prototype, 'verify');
    const getter = vi.fn(() => 'https://app.example');
    const accessor = { ...web };
    Object.defineProperty(accessor, 'exactOrigin', { get: getter, enumerable: true });
    const hidden = { ...web };
    Object.defineProperty(hidden, 'identityId', { value: ID, enumerable: false });
    const inherited = Object.create(web) as VerifiedTransportContext;
    const protoField = { ...web };
    Object.defineProperty(protoField, '__proto__', { value: {}, enumerable: true });
    for (const context of [accessor, hidden, inherited, protoField, { ...web, [Symbol('extra')]: true }]) {
      await expect(f.producer.issue(context)).rejects.toThrowError(new Error(FAILURE));
    }
    expect(getter).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(f.resolveRegisteredIdentityId).not.toHaveBeenCalled();
    expect(f.records).toHaveLength(0);
  });

  it('uses only the fixed simulator fixture and passes only its HMAC to registered lookup', async () => {
    const f = setup();
    const verify = vi.spyOn(BankIdSimulator.prototype, 'verify');
    const proof = await f.producer.issue(web);
    expect(verify).toHaveBeenCalledExactlyOnceWith('alice');
    const simulatorResult = await originalVerify.call(new BankIdSimulator(Buffer.from(KEY).toString('hex')), 'alice');
    expect(f.resolveRegisteredIdentityId).toHaveBeenCalledExactlyOnceWith(simulatorResult.personnummerHmac);
    const record = f.records[0];
    expect(record?.purpose).toBe('login');
    expect(record?.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const binding: ProofBinding = { purpose: 'login', challenge: record?.challenge ?? '',
      transport: 'web', identityId: ID, exactOrigin: web.exactOrigin, browserChainId: web.browserChainId };
    expect(await f.proofStore.consume(proof, binding)).toEqual({ valid: true });
    expect(await f.proofStore.consume(proof, binding)).toEqual({ valid: false });
  });

  it('binds mobile and web login proofs, makes challenges fresh, and consumes each once', async () => {
    const f = setup();
    const first = await f.producer.issue(web);
    const second = await f.producer.issue(web);
    const mobileProof = await f.producer.issue(mobile);
    expect(first).not.toBe(second);
    expect(f.records).toHaveLength(3);
    const webRecords = f.records.slice(0, 2);
    expect(new Set(webRecords.map((record) => record.challenge)).size).toBe(2);
    const firstRecord = webRecords[0];
    const mobileRecord = f.records[2];
    expect(firstRecord?.transport).toBe('web');
    expect(firstRecord?.exactOrigin).toBe(web.exactOrigin);
    expect(firstRecord?.browserChainId).toBe(web.browserChainId);
    expect(mobileRecord?.transport).toBe('mobile');
    const firstBinding: ProofBinding = { purpose: 'login', challenge: firstRecord?.challenge ?? '', transport: 'web', identityId: ID,
      exactOrigin: web.exactOrigin, browserChainId: web.browserChainId };
    expect(await f.proofStore.consume(first, { ...firstBinding, identityId: '123e4567-e89b-42d3-a456-426614174001' })).toEqual({ valid: false });
    expect(await f.proofStore.consume(first, { ...firstBinding, exactOrigin: 'https://other.example' })).toEqual({ valid: false });
    expect(await f.proofStore.consume(first, { ...firstBinding, browserChainId: 'other-chain' })).toEqual({ valid: false });
    for (const [secret, record] of [[first, firstRecord], [mobileProof, mobileRecord]] as const) {
      const binding: ProofBinding = { purpose: 'login', challenge: record?.challenge ?? '', transport: record?.transport ?? 'mobile',
        identityId: ID, ...(record?.transport === 'web' ? { exactOrigin: record.exactOrigin, browserChainId: record.browserChainId } : {}) };
      expect(await f.proofStore.consume(secret, binding)).toEqual({ valid: true });
      expect(await f.proofStore.consume(secret, binding)).toEqual({ valid: false });
    }
    expect(f.resolveRegisteredIdentityId).toHaveBeenCalledTimes(3);
  });

  it('issues independent proofs concurrently', async () => {
    const f = setup();
    const proofs = await Promise.all(Array.from({ length: 8 }, () => f.producer.issue(mobile)));
    expect(new Set(proofs).size).toBe(8);
    expect(new Set(f.records.map((record) => record.challenge)).size).toBe(8);
    expect(f.records.every((record) => record.purpose === 'login')).toBe(true);
  });

  it('collapses resolver, unknown identity, and malformed or stale simulator results to the generic error', async () => {
    const missing = setup({ identityResolver: { resolveRegisteredIdentityId: () => null } });
    await expect(missing.producer.issue(mobile)).rejects.toThrow(FAILURE);
    const broken = setup({ identityResolver: { resolveRegisteredIdentityId: () => { throw new Error('private'); } } });
    await expect(broken.producer.issue(mobile)).rejects.toThrow(FAILURE);
    const invalidIdentity = setup({ identityResolver: { resolveRegisteredIdentityId: () => 'not-a-uuid' } });
    await expect(invalidIdentity.producer.issue(mobile)).rejects.toThrow(FAILURE);
    const providerFailure = setup();
    vi.spyOn(BankIdSimulator.prototype, 'verify').mockRejectedValueOnce(new Error('provider-secret alice'));
    await expect(providerFailure.producer.issue(mobile)).rejects.toThrow(FAILURE);
    expect(providerFailure.resolveRegisteredIdentityId).not.toHaveBeenCalled();
    for (const result of [
      null,
      { method: 'BANKID', name: 'secret', verifiedAt: new Date(NOW).toISOString() },
      { method: 'OTP', name: 'secret', personnummerHmac: 'a'.repeat(64), verifiedAt: new Date(NOW).toISOString() },
      { method: 'BANKID', name: 'secret', personnummerHmac: 'A'.repeat(64), verifiedAt: new Date(NOW).toISOString() },
      { method: 'BANKID', name: 'secret', personnummerHmac: 'a'.repeat(64), verifiedAt: 'invalid' },
      { method: 'BANKID', name: 'secret', personnummerHmac: 'a'.repeat(64), verifiedAt: new Date(NOW + 1).toISOString() },
      { method: 'BANKID', name: 'secret', personnummerHmac: 'a'.repeat(64), verifiedAt: new Date(NOW - 300_001).toISOString() },
    ]) {
      const f = setup();
      vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue(result as never);
      await expect(f.producer.issue(web)).rejects.toThrow(FAILURE);
      await expect(f.producer.issue(web)).rejects.toThrowError(new Error(FAILURE));
      expect(f.resolveRegisteredIdentityId).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it('rejects a result that expires while registered identity lookup is pending', async () => {
    const issue = vi.spyOn(ProofStore.prototype, 'issue');
    const f = setup({ clock: Date.now, identityResolver: { resolveRegisteredIdentityId: async () => {
      vi.setSystemTime(NOW + 300_001);
      return ID;
    } } });
    await expect(f.producer.issue(web)).rejects.toThrowError(new Error(FAILURE));
    expect(issue).not.toHaveBeenCalled();
    expect(f.records).toHaveLength(0);
  });

  it('hides proof repository errors behind the generic failure', async () => {
    const proofStore = new ProofStore({
      insert: () => { throw new Error('database-secret'); },
      compareAndConsume: () => false,
    }, () => NOW);
    const f = setup({ proofStore });
    await expect(f.producer.issue(web)).rejects.toThrowError(new Error(FAILURE));
    expect(f.records).toHaveLength(0);
  });

  it('rejects invalid or throwing clocks before invoking the simulator', async () => {
    const verify = vi.spyOn(BankIdSimulator.prototype, 'verify');
    for (const value of [NaN, Infinity, -1, 1.5]) {
      const f = setup({ clock: () => value });
      await expect(f.producer.issue(web)).rejects.toThrowError(new Error(FAILURE));
      expect(f.resolveRegisteredIdentityId).not.toHaveBeenCalled();
    }
    const f = setup({ clock: () => { throw new Error('private-clock-detail'); } });
    await expect(f.producer.issue(web)).rejects.toThrowError(new Error(FAILURE));
    expect(verify).not.toHaveBeenCalled();
  });

  it('accepts exactly five-minute-old simulator evidence and rejects one millisecond older', async () => {
    const verify = vi.spyOn(BankIdSimulator.prototype, 'verify');
    verify.mockResolvedValue({ method: 'BANKID', name: 'fixture', personnummerHmac: 'a'.repeat(64), verifiedAt: new Date(NOW - 300_000).toISOString() });
    const f = setup();
    await expect(f.producer.issue(mobile)).resolves.toMatch(/^v2\.[A-Za-z0-9_-]{43}$/);
    verify.mockResolvedValue({ method: 'BANKID', name: 'fixture', personnummerHmac: 'a'.repeat(64), verifiedAt: new Date(NOW - 300_001).toISOString() });
    await expect(f.producer.issue(mobile)).rejects.toThrowError(new Error(FAILURE));
    expect(f.records).toHaveLength(1);
  });

  it('copies key bytes at construction', async () => {
    const mutableKey = new Uint8Array(KEY);
    const f = setup({ simulatorHmacKey: mutableKey });
    mutableKey.fill(0);
    const expected = new BankIdSimulator(Buffer.from(KEY).toString('hex'));
    const expectedResult = await expected.verify('alice');
    await f.producer.issue(mobile);
    expect(f.resolveRegisteredIdentityId).toHaveBeenCalledWith(expectedResult.personnummerHmac);
  });

  it('does not allow a restricted OTP proof to redeem as a login proof', async () => {
    const proofStore = new ProofStore(new InMemoryProofRepository(), () => NOW);
    const otp = new OtpProofProducer(new Uint8Array(32).fill(9), new InMemoryOtpChallengeRepository(), proofStore, () => NOW);
    const provisioned = await otp.provision({ purpose: 'otp_step_up', identifierHash: 'a'.repeat(64), channel: 'email', transportContext: mobile });
    const restrictedProof = await otp.verify({ challengeId: provisioned.challengeId, code: provisioned.code, transportContext: mobile });
    const loginBinding: ProofBinding = { purpose: 'login', challenge: provisioned.challengeId, transport: 'mobile', identityId: ID };
    expect(await proofStore.consume(restrictedProof, loginBinding)).toEqual({ valid: false });
  });
});
