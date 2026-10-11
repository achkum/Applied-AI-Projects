import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BankIdSimulator } from './bankid-simulator';
import { DevelopmentEnrollmentPersonVerifier, type DevelopmentEnrollmentPersonVerifierOptions as Options } from './development-enrollment-person-verifier';
import type { IdentityResult } from './identity-provider.interface';

const NOW = 1_800_000_000_000;
const FAILURE = 'Development enrollment person unavailable';
const key = () => new Uint8Array(32).fill(7);
const options = (): Options => ({ environment: 'development', enabled: true, simulatorHmacKey: key(), clock: () => NOW });
const valid = (): IdentityResult => ({ method: 'BANKID', name: 'Alice Andersson', personnummerHmac: 'a'.repeat(64), verifiedAt: new Date(NOW).toISOString() });
const create = (value: unknown) => new DevelopmentEnrollmentPersonVerifier(value as Options);
const result = (value: unknown) => vi.spyOn(BankIdSimulator.prototype, 'verify').mockResolvedValue(value as IdentityResult);
async function denied(verifier: DevelopmentEnrollmentPersonVerifier) {
  const error = await verifier.verify().catch((failure: unknown) => failure);
  expect(error instanceof Error).toBe(true);
  expect((error as Error).message).toBe(FAILURE);
  expect(Object.keys(error as object)).toEqual([]);
  expect(Object.hasOwn(error as object, 'cause')).toBe(false);
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('private trusted enrollment person', () => {
  it('uses independent copied key, trusted names and immutable scalar output', async () => {
    const input = { ...options() };
    Object.defineProperty(input.simulatorHmacKey, 'byteLength', { value: 32 });
    const expected = createHmac('sha256', Buffer.from(input.simulatorHmacKey).toString('hex')).update('199001012391').digest('hex');
    const verifier = create(input);
    input.simulatorHmacKey.fill(9); input.enabled = false; input.environment = 'production'; input.clock = () => -1;
    const person = await verifier.verify();
    expect(person.personnummerHmac === expected).toBe(true);
    expect(person.givenName === 'Alice' && person.surname === 'Andersson').toBe(true);
    expect(person.method).toBe('BANKID'); expect(person.verifiedAt).toBe(new Date(NOW).toISOString());
    expect(Object.isFrozen(person)).toBe(true); expect(Reflect.set(person, 'givenName', 'changed')).toBe(false);
    expect(Object.keys(person).sort()).toEqual(['givenName', 'method', 'personnummerHmac', 'surname', 'verifiedAt']);
    expect((await create({ ...options(), clock: undefined }).verify()).method).toBe('BANKID');
  });
  it.each([31, 0])('refuses copied key shorter than 32 bytes despite forged byteLength %#', (length) => {
    const shortKey = Object.defineProperty(new Uint8Array(length), 'byteLength', { value: 32 });
    let error: unknown;
    try { create({ ...options(), simulatorHmacKey: shortKey }); } catch (failure) { error = failure; }
    expect(error instanceof Error).toBe(true);
    expect((error as Error).message).toBe(FAILURE);
    expect(Object.keys(error as object)).toEqual([]);
    expect(Object.hasOwn(error as object, 'cause')).toBe(false);
  });
  it.each([
    undefined, null, 1, [], Object.create(null), Object.create({ environment: 'development' }),
    { ...options(), environment: 'production' }, { ...options(), environment: 'test' },
    { ...options(), enabled: false }, { ...options(), enabled: 1 },
    { ...options(), simulatorHmacKey: undefined }, { ...options(), simulatorHmacKey: new Uint8Array(31) },
    { ...options(), clock: 1 }, { ...options(), provider: {} },
    { ...options(), [Symbol('extra')]: true },
    Object.defineProperty(options(), 'enabled', { enumerable: false, value: true }),
  ])('rejects unavailable or malformed constructor configuration %#', (input) => {
    expect(() => create(input)).toThrow(FAILURE);
  });
  it('refuses option getters and proxy failures without invoking getters', () => {
    const getter = vi.fn(() => { throw new Error('private diagnostic'); });
    expect(() => create(Object.defineProperty(options(), 'enabled', { get: getter }))).toThrow(FAILURE);
    expect(getter).not.toHaveBeenCalled();
    expect(() => create(new Proxy({}, { getPrototypeOf: () => { throw new Error('private diagnostic'); } }))).toThrow(FAILURE);
  });
  it('refuses all runtime arguments before invoking the simulator', async () => {
    const spy = result(valid());
    const verifier = create(options());
    await expect(Reflect.apply(verifier.verify, verifier, [undefined])).rejects.toThrow(FAILURE);
    await expect(Reflect.apply(verifier.verify, verifier, [{ subject: 'untrusted', givenName: 'untrusted' }])).rejects.toThrow(FAILURE);
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER, 8_640_000_000_000_001])('refuses invalid clock %#', async (time) => {
    await denied(create({ ...options(), clock: () => time }));
  });
  it('sanitizes throwing clock and simulator diagnostics', async () => {
    await denied(create({ ...options(), clock: () => { throw new Error('private clock diagnostic'); } }));
    vi.spyOn(BankIdSimulator.prototype, 'verify').mockRejectedValue(new Error('private provider diagnostic'));
    await denied(create(options()));
  });
  it.each([
    null, undefined, 'text', [], Object.create(valid()), Object.assign(Object.create(null), valid()),
    { ...valid(), extra: true }, { ...valid(), method: 'OTP' }, { ...valid(), name: 'arbitrary full name' },
    { ...valid(), personnummerHmac: 1 }, { ...valid(), personnummerHmac: 'A'.repeat(64) },
    { ...valid(), verifiedAt: 1 }, { ...valid(), verifiedAt: 'invalid' },
    { ...valid(), verifiedAt: new Date(-1).toISOString() }, { ...valid(), verifiedAt: new Date(NOW + 1).toISOString() },
    { ...valid(), verifiedAt: new Date(NOW - 300_001).toISOString() },
    { ...valid(), verifiedAt: new Date(NOW).toISOString().replace('.000Z', 'Z') },
    { ...valid(), [Symbol('extra')]: true }, Object.defineProperty(valid(), 'method', { value: 'BANKID', enumerable: false }),
  ])('rejects malformed simulator evidence %#', async (input) => { result(input); await denied(create(options())); });
  it('rejects missing descriptors and accessors without executing them', async () => {
    const getter = vi.fn(() => 'BANKID');
    result(Object.defineProperty(valid(), 'method', { get: getter }));
    await denied(create(options())); expect(getter).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    result(new Proxy(valid(), { getOwnPropertyDescriptor: () => undefined }));
    await denied(create(options()));
  });
  it('snapshots evidence after await without retaining a mutable provider object', async () => {
    const evidence = valid(); result(evidence);
    const person = await create(options()).verify(); evidence.personnummerHmac = 'b'.repeat(64); evidence.name = 'changed';
    expect(person.personnummerHmac === 'a'.repeat(64) && person.givenName === 'Alice').toBe(true);
  });
  it('accepts inclusive age and elapsed limits, epoch zero and maximum Date', async () => {
    result({ ...valid(), verifiedAt: new Date(NOW - 300_000).toISOString() });
    await expect(create(options()).verify()).resolves.toHaveProperty('method', 'BANKID');
    vi.restoreAllMocks(); result(valid());
    await expect(create({ ...options(), clock: vi.fn().mockReturnValueOnce(NOW).mockReturnValue(NOW + 300_000) }).verify()).resolves.toHaveProperty('method', 'BANKID');
    for (const time of [0, 8_640_000_000_000_000]) {
      vi.restoreAllMocks(); result({ ...valid(), verifiedAt: new Date(time).toISOString() });
      await expect(create({ ...options(), clock: () => time }).verify()).resolves.toHaveProperty('method', 'BANKID');
    }
  });
  it.each([[NOW, NOW - 1], [NOW, NOW + 300_001], [NOW, NaN]])('rechecks clock after await %#', async (before, after) => {
    result(valid()); await denied(create({ ...options(), clock: vi.fn().mockReturnValueOnce(before).mockReturnValue(after) }));
  });
  it('keeps monotonicity across sequential and overlapping calls', async () => {
    result(valid()); const clock = vi.fn().mockReturnValue(NOW); const verifier = create({ ...options(), clock });
    await verifier.verify(); clock.mockReturnValue(NOW - 1); await denied(verifier);
    vi.restoreAllMocks();
    let release!: (value: IdentityResult) => void;
    vi.spyOn(BankIdSimulator.prototype, 'verify').mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue(valid());
    const concurrentClock = vi.fn().mockReturnValueOnce(NOW).mockReturnValueOnce(NOW + 2).mockReturnValueOnce(NOW + 2).mockReturnValue(NOW + 1);
    const concurrent = create({ ...options(), clock: concurrentClock });
    const pending = concurrent.verify(); await concurrent.verify(); release(valid());
    await expect(pending).rejects.toThrow(FAILURE);
  });
});
