import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { load } from 'js-yaml';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { runCatalogueExtraction, validateSourceRegistry } from '../../src/scraping/pipeline.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const cli = path.join(root, 'packages/catalog/src/scraping/cli.ts');
const runFile = promisify(execFile);
let temp: string;

function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Expected a source result');
  return item;
}

async function setup(html: string, sourceId = 'storytel-se', previous?: Record<string, string>) {
  if (temp) await rm(temp, { recursive: true, force: true });
  temp = await mkdtemp(path.join(os.tmpdir(), 'subtrack-catalog-'));
  await writeFile(path.join(temp, 'capture.html'), html);
  const entry = { sourceId, inputPath: 'capture.html', provenance: 'synthetic', capturedAt: '2026-10-10T10:00:00Z', ...(previous ? { previousMinorUnits: previous } : {}) };
  await writeFile(path.join(temp, 'manifest.json'), JSON.stringify({ version: 1, sources: [entry] }));
  return { manifest: path.join(temp, 'manifest.json'), output: path.join(temp, 'candidate.json') };
}

async function run(html: string, sourceId?: string, previous?: Record<string, string>) {
  const files = await setup(html, sourceId, previous);
  await runCatalogueExtraction(files.manifest, files.output);
  return JSON.parse(await readFile(files.output, 'utf8')) as { results: { observations: { plan: string; minorUnits: string }[]; quarantined: { plan: string; minorUnits?: string; reason: string }[]; inputSha256: string; marketPriceVerified: false }[] };
}

async function runCli(manifest: string, output: string) {
  await runFile(process.execPath, ['--import', 'tsx', cli, manifest, output], { cwd: path.join(root, 'packages/catalog'), timeout: 30_000 });
}

const storytel = '<main><article data-plan="premium"><h2>Premium</h2><span>169 kr/mån</span></article><article data-plan="unlimited"><h2>Unlimited</h2><span>199 kr per månad</span></article></main>';
const bookbeat = '<section><div data-plan="basic"><b>Basic</b><br><span>99 SEK/month</span></div><div data-plan="premium"><b>Premium</b><br><span>149 SEK per month</span></div></section>';

afterEach(async () => { if (temp) await rm(temp, { recursive: true, force: true }); });

describe('offline catalogue candidate command', () => {
  it('rejects unknown registry ids with missing URLs and non-string URLs', async () => {
    const parsed = load(await readFile(path.join(root, 'packages/catalog/sources.yaml'), 'utf8')) as { version: number; sources: Record<string, unknown>[] };
    const original = first(parsed.sources);
    for (const invalid of [{ ...original, id: 'unknown-source', source_url: undefined }, { ...original, source_url: 123 }]) {
      expect(() => validateSourceRegistry({ ...parsed, sources: [invalid, ...parsed.sources.slice(1)] })).toThrow('Invalid source registry');
    }
  });

  it('prevents script mutation while retaining ordinary fixture extraction', async () => {
    const html = `${storytel}<script>document.querySelector('[data-plan="premium"]').textContent='Premium 1 kr/month'</script>`;
    const result = await run(html, 'storytel-se', { Premium: '16900', Unlimited: '19900' });
    expect(first(result.results).observations.map((row) => row.minorUnits)).toEqual(['16900', '19900']);
  }, 30_000);

  it('runs the real Playwright CLI on the Storytel synthetic fixture and records provenance', async () => {
    const files = await setup(storytel, 'storytel-se', { Premium: '16900', Unlimited: '19900' });
    await runCli(files.manifest, files.output);
    const result = JSON.parse(await readFile(files.output, 'utf8')) as { results: { observations: { plan: string; minorUnits: string }[]; inputSha256: string; marketPriceVerified: false }[] };
    expect(first(result.results).observations.map((row) => row.minorUnits)).toEqual(['16900', '19900']);
    expect(first(result.results).inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first(result.results).marketPriceVerified).toBe(false);
  }, 30_000);

  it('registers BookBeat and rejects changed markup without partial candidates', async () => {
    const result = await run(bookbeat.replace('149 SEK per month', 'From 149 SEK per month'), 'bookbeat-se', { Basic: '9900', Premium: '14900' });
    expect(first(result.results).observations).toEqual([]);
    expect(first(result.results).quarantined).toEqual([{ plan: '*', reason: 'source_extraction_failed' }]);
  }, 30_000);

  it('extracts both registered source fixtures through the real CLI', async () => {
    const files = await setup(bookbeat, 'bookbeat-se', { Basic: '9900', Premium: '14900' });
    await runCli(files.manifest, files.output);
    const result = JSON.parse(await readFile(files.output, 'utf8')) as { results: { observations: { minorUnits: string }[]; marketPriceVerified: false }[] };
    expect(first(result.results).observations.map((row) => row.minorUnits)).toEqual(['9900', '14900']);
    expect(first(result.results).marketPriceVerified).toBe(false);
  }, 30_000);

  it('allows exactly 40 percent and quarantines greater changes and missing baselines', async () => {
    const html = '<main><div data-plan="premium">Premium 140 kr/month</div><div data-plan="unlimited">Unlimited 199 kr/month</div></main>';
    const result = await run(html, 'storytel-se', { Premium: '10000', Unlimited: '10000' });
    expect(first(result.results).observations).toEqual([{ plan: 'Premium', currency: 'SEK', minorUnits: '14000' }]);
    expect(first(result.results).quarantined).toEqual([{ plan: 'Unlimited', currency: 'SEK', minorUnits: '19900', reason: 'change_over_40_percent' }]);
    const missing = await run(html, 'storytel-se', { Premium: '10000' });
    expect(first(missing.results).quarantined[0]).toEqual({ plan: 'Unlimited', currency: 'SEK', minorUnits: '19900', reason: 'baseline_missing' });
  }, 30_000);

  it('uses absolute change for decreases and quarantines zero baselines', async () => {
    const html = '<main><div data-plan="premium">Premium 60 kr/month</div><div data-plan="unlimited">Unlimited 59 kr/month</div></main>';
    const result = await run(html, 'storytel-se', { Premium: '10000', Unlimited: '0' });
    expect(first(result.results).observations).toEqual([{ plan: 'Premium', currency: 'SEK', minorUnits: '6000' }]);
    expect(first(result.results).quarantined).toEqual([{ plan: 'Unlimited', currency: 'SEK', minorUnits: '5900', reason: 'invalid_baseline' }]);
  }, 30_000);

  it.each([
    ['promotion', '<div data-plan="premium">Premium 169 kr/month, from 99 kr/month</div>'],
    ['annual cadence', '<div data-plan="premium">Premium 169 kr/month, 1200 kr/year</div>'],
    ['mixed currency', '<div data-plan="premium">Premium 169 kr/month or €10</div>'],
    ['duplicate plan anchors', '<div data-plan="premium">Premium 169 kr/month</div><div data-plan="premium">Premium 169 kr/month</div>'],
    ['duplicate price tokens', '<div data-plan="premium">Premium 169 kr/month, 99 kr/month</div>'],
    ['decimal price', '<div data-plan="premium">Premium 169,50 kr/month</div>'],
    ['grouped price', '<div data-plan="premium">Premium 1 699 kr/month</div>'],
    ['NOK price', '<div data-plan="premium">Premium 169 NOK/month</div>'],
    ['price without the plan name', '<div data-plan="premium">169 kr/month</div>'],
  ])('fails the whole source on %s', async (_caseName, premium) => {
    const html = `<main>${premium}<div data-plan="unlimited">Unlimited 199 kr/month</div></main>`;
    const result = await run(html, 'storytel-se', { Premium: '16900', Unlimited: '19900' });
    expect(first(result.results).observations).toEqual([]);
    expect(first(result.results).quarantined).toEqual([{ plan: '*', reason: 'source_extraction_failed' }]);
  }, 30_000);

  it('keeps scripts disabled and blocks network and file access in page markup', async () => {
    let requests = 0;
    const server = createServer((_request, response) => { requests += 1; response.end('not loaded'); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server unavailable');
      const files = await setup(storytel, 'storytel-se', { Premium: '16900', Unlimited: '19900' });
      const sentinel = path.join(temp, 'private-sentinel.txt');
      await writeFile(sentinel, 'PRIVATE_FILE_SENTINEL');
      const fileUrl = pathToFileURL(sentinel).href;
      const html = `<iframe src="${fileUrl}"></iframe><object data="${fileUrl}"></object><meta http-equiv="refresh" content="0;url=http://127.0.0.1:${address.port}/refresh"><script>document.querySelector('[data-plan="premium"]').textContent='Premium 1 kr/month';fetch('http://127.0.0.1:${address.port}/script')</script>${storytel}<img src="http://127.0.0.1:${address.port}/pixel">`;
      await writeFile(path.join(temp, 'capture.html'), html);
      await runCatalogueExtraction(files.manifest, files.output);
      const artifact = await readFile(files.output, 'utf8');
      const result = JSON.parse(artifact) as Awaited<ReturnType<typeof run>>;
      expect(artifact).not.toContain('PRIVATE_FILE_SENTINEL');
      expect(first(result.results).observations).toEqual([]);
      expect(first(result.results).quarantined).toEqual([{ plan: '*', reason: 'source_extraction_failed' }]);
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 30_000);

  it('rejects local-file frames and does not expose their text to extraction', async () => {
    const files = await setup(storytel, 'storytel-se', { Premium: '16900', Unlimited: '19900' });
    const sentinel = path.join(temp, 'private-sentinel.txt');
    await writeFile(sentinel, 'PRIVATE_FILE_SENTINEL');
    const fileUrl = pathToFileURL(sentinel).href;
    const malicious = `${storytel}<iframe src="${fileUrl}"></iframe><object data="${fileUrl}"></object><base href="${fileUrl}">`;
    await writeFile(path.join(temp, 'capture.html'), malicious);
    await runCatalogueExtraction(files.manifest, files.output);
    const result = JSON.parse(await readFile(files.output, 'utf8')) as { results: { observations: { minorUnits: string }[] }[] };
    expect(first(result.results).observations.map((row) => row.minorUnits)).toEqual(['16900', '19900']);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_FILE_SENTINEL');
  }, 30_000);

  it('rejects unknown manifest fields before writing an artifact', async () => {
    const files = await setup(storytel);
    const raw = JSON.parse(await readFile(files.manifest, 'utf8')) as Record<string, unknown>;
    raw['sourceUrl'] = 'https://attacker.invalid';
    await writeFile(files.manifest, JSON.stringify(raw));
    await expect(runCli(files.manifest, files.output)).rejects.toBeDefined();
  }, 30_000);

  it('rejects unknown sources, malformed provenance and paths before extraction', async () => {
    const files = await setup(storytel);
    const original = JSON.parse(await readFile(files.manifest, 'utf8')) as { version: number; sources: Record<string, unknown>[] };
    const invalidEntries = [
      { ...original.sources[0], sourceId: 'unknown-source' },
      { ...original.sources[0], inputPath: '../outside.html' },
      { ...original.sources[0], provenance: 'live' },
      { ...original.sources[0], capturedAt: '2026-02-31T10:00:00Z' },
      { ...original.sources[0], nested: { sourceUrl: 'https://unregistered.invalid' } },
      { ...original.sources[0], previousMinorUnits: { Other: '100' } },
      { ...original.sources[0], previousMinorUnits: { Premium: '01' } },
    ];
    for (const entry of invalidEntries) {
      await writeFile(files.manifest, JSON.stringify({ version: 1, sources: [entry] }));
      await expect(runCatalogueExtraction(files.manifest, files.output)).rejects.toBeDefined();
    }
    await expect(readFile(files.output, 'utf8')).rejects.toBeDefined();
  }, 30_000);

  it('rejects output aliases and preserves existing output files', async () => {
    const files = await setup(storytel, 'storytel-se', { Premium: '16900', Unlimited: '19900' });
    const before = await readFile(path.join(temp, 'capture.html'), 'utf8');
    await expect(runCatalogueExtraction(files.manifest, path.join(temp, 'capture.html'))).rejects.toBeDefined();
    await writeFile(files.output, 'preserve');
    await expect(runCatalogueExtraction(files.manifest, files.output)).rejects.toBeDefined();
    expect(await readFile(files.output, 'utf8')).toBe('preserve');
    expect(await readFile(path.join(temp, 'capture.html'), 'utf8')).toBe(before);
  }, 30_000);

  it('bounds manifest and HTML input sizes before parsing or extraction', async () => {
    const files = await setup(storytel);
    await writeFile(files.manifest, ' '.repeat(16_385));
    await expect(runCatalogueExtraction(files.manifest, files.output)).rejects.toBeDefined();
    await writeFile(files.manifest, JSON.stringify({ version: 1, sources: [{ sourceId: 'storytel-se', inputPath: 'capture.html', provenance: 'synthetic', capturedAt: '2026-10-10T10:00:00Z' }] }));
    await writeFile(path.join(temp, 'capture.html'), 'x'.repeat(1_048_577));
    await expect(runCatalogueExtraction(files.manifest, files.output)).rejects.toBeDefined();
    await expect(readFile(files.output, 'utf8')).rejects.toBeDefined();
  }, 30_000);
});
