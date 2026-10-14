import { createHmac } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { BankIdSimulator, DEVELOPMENT_ENROLLMENT_PERSON } from './bankid-simulator';

afterEach(() => vi.useRealTimers());
it('uses trusted controlled issuance time while legacy defaults retain actual wall time', async () => {
  const started = Date.now(), controlled = started - 3_600_000;
  const result = await new BankIdSimulator('synthetic-test-key', () => controlled).verify('ALICE');
  expect(result.verifiedAt).toBe(new Date(controlled).toISOString());
  expect(result.personnummerHmac).toBe(createHmac('sha256', 'synthetic-test-key').update('199001012391').digest('hex'));
  expect(Object.keys(result).sort()).toEqual(['method', 'name', 'personnummerHmac', 'verifiedAt']);
  expect(result.name).toBe('Alice Andersson'); expect(result.method).toBe('BANKID');
  const wall = Date.parse((await new BankIdSimulator('synthetic-test-key').verify('bob')).verifiedAt);
  expect(wall).toBeGreaterThanOrEqual(started); expect(wall).toBeLessThanOrEqual(Date.now());
});
it('rejects nonfunction, throwing or invalid trusted clocks without issuing evidence', async () => {
  expect(() => new BankIdSimulator('synthetic-test-key', null as unknown as () => number)).toThrow('BankID simulator clock unavailable');
  await expect(new BankIdSimulator('synthetic-test-key', () => NaN).verify('alice')).rejects.toThrow();
  await expect(new BankIdSimulator('synthetic-test-key', () => { throw new Error('clock unavailable'); }).verify('alice')).rejects.toThrow('clock unavailable');
});
it('keeps legacy result shape, case handling and deterministic registered fixtures', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  const simulator = new BankIdSimulator('synthetic-test-key');
  const result = await simulator.verify('ALICE');
  const expected = createHmac('sha256', 'synthetic-test-key').update('199001012391').digest('hex');
  expect(result.personnummerHmac === expected).toBe(true);
  expect(Object.keys(result).sort()).toEqual(['method', 'name', 'personnummerHmac', 'verifiedAt']);
  expect(result.name === 'Alice Andersson' && result.method === 'BANKID').toBe(true);
  expect(result.verifiedAt).toBe(new Date(1_800_000_000_000).toISOString());
  expect((await simulator.verify('bob')).personnummerHmac === result.personnummerHmac).toBe(false);
  expect((await simulator.verify('carol')).method).toBe('BANKID');
  await expect(simulator.verify('invalid')).rejects.toThrow(Error);
  expect(Object.isFrozen(DEVELOPMENT_ENROLLMENT_PERSON)).toBe(true);
  expect(Reflect.set(DEVELOPMENT_ENROLLMENT_PERSON, 'surname', 'changed')).toBe(false);
});
