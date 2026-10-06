import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { formatMinorUnits } from '@subtrack/money';
import { PERSONA_LINDQVIST } from '@subtrack/synthetic';
import { createDemoFixture, generateDemoFixtureAtomically } from '../scripts/generate-demo-fixture';

it('keeps the checked-in bilingual demo display data fresh and exact', async () => {
  const expected = createDemoFixture();
  if (process.env.DEMO_GENERATION === '1') {
    await generateDemoFixtureAtomically();
    return;
  }
  const artifact = resolve(process.cwd(), 'src/generated/demo-fixture.json');
  const checkedInFixture = JSON.parse(await readFile(artifact, 'utf8')) as typeof expected;
  expect(checkedInFixture).toEqual(expected);
  expect(expected.subscriptions).toHaveLength(6);
  expected.subscriptions.forEach((row, index) => {
    const source = PERSONA_LINDQVIST.subscriptions[index];
    expect(source).toBeDefined();
    expect(row).toMatchObject({
      id: source?.id,
      merchantName: source?.merchantName,
      billingCadence: source?.billingCadence,
      currency: source?.currency,
      amountMinor: String(source?.amountMinor),
      displayAmount: {
        en: formatMinorUnits(BigInt(source?.amountMinor ?? 0), source?.currency ?? 'SEK', { locale: 'en' }),
        sv: formatMinorUnits(BigInt(source?.amountMinor ?? 0), source?.currency ?? 'SEK', { locale: 'sv' }),
      },
    });
  });
});

it('rejects unsafe source amounts before conversion and formatter errors', () => {
  const unsafe = [{ ...PERSONA_LINDQVIST.subscriptions[0]!, amountMinor: Number.MAX_SAFE_INTEGER + 1 }];
  expect(() => createDemoFixture(unsafe)).toThrow(/Unsafe minor-unit amount/);
  expect(() => createDemoFixture([PERSONA_LINDQVIST.subscriptions[0]!], () => {
    throw new RangeError('formatter failure');
  })).toThrow('formatter failure');
});

it('preserves the destination on unsafe input and late formatter failure, then replaces it atomically', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'subtrack-demo-'));
  const destination = resolve(directory, 'fixture.json');
  const original = 'existing artifact\n';
  try {
    await writeFile(destination, original);
    const formatter = vi.fn(formatMinorUnits);
    const unsafe = [{ ...PERSONA_LINDQVIST.subscriptions[0]!, amountMinor: Number.MAX_SAFE_INTEGER + 1 }];
    await expect(generateDemoFixtureAtomically(destination, unsafe, formatter)).rejects.toThrow(/Unsafe minor-unit amount/);
    expect(formatter).not.toHaveBeenCalled();
    let calls = 0;
    await expect(generateDemoFixtureAtomically(destination, PERSONA_LINDQVIST.subscriptions, (...args) => {
      calls += 1;
      if (calls === 12) throw new RangeError('late locale failure');
      return formatMinorUnits(...args);
    })).rejects.toThrow('late locale failure');
    expect(calls).toBe(12);
    expect(await readFile(destination, 'utf8')).toBe(original);
    expect(await readdir(directory)).toEqual(['fixture.json']);
    await generateDemoFixtureAtomically(destination);
    expect(JSON.parse(await readFile(destination, 'utf8'))).toEqual(createDemoFixture());
    expect(await readdir(directory)).toEqual(['fixture.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
