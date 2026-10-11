import { createHmac } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { BankIdSimulator, DEVELOPMENT_ENROLLMENT_PERSON } from './bankid-simulator';

afterEach(() => vi.useRealTimers());
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
