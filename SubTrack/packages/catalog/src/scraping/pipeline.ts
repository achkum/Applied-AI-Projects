import { createHash } from 'node:crypto';
import { open, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import { greaterThan, money, multiply, subtract } from '@subtrack/money';
import { load } from 'js-yaml';

const MAX_MANIFEST_BYTES = 16_384;
const MAX_HTML_BYTES = 1_048_576;
const MAX_SOURCES = 2;
const MAX_PLANS = 4;
const SOURCES_FILE = new URL('../../sources.yaml', import.meta.url);

type Plan = { name: string; anchor: string };
type Source = {
  id: string;
  name: string;
  source_url: string;
  live_enabled: false;
  terms_decision: 'unresolved';
  extractor_version: string;
  plans: Plan[];
};
type Input = {
  sourceId: string;
  inputPath: string;
  provenance: 'synthetic' | 'manual-fixture';
  capturedAt: string;
  previousMinorUnits?: Record<string, string>;
};
type Manifest = { version: 1; sources: Input[] };
type Observation = {
  plan: string;
  currency: 'SEK';
  minorUnits: string;
};
type Result = {
  sourceId: string;
  sourceUrl: string;
  extractorVersion: string;
  inputSha256: string;
  capturedAt: string;
  provenance: Input['provenance'];
  marketPriceVerified: false;
  observations: Observation[];
  quarantined: { plan: string; currency?: 'SEK'; minorUnits?: string; reason: string }[];
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid input');
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Invalid input fields');
}

function parseManifest(value: unknown): Manifest {
  const root = record(value);
  exactKeys(root, ['version', 'sources']);
  if (root.version !== 1 || !Array.isArray(root.sources) || root.sources.length < 1 || root.sources.length > MAX_SOURCES) {
    throw new Error('Invalid manifest');
  }
  const seen = new Set<string>();
  const sources = root.sources.map((entry): Input => {
    const input = record(entry);
    exactKeys(input, ['sourceId', 'inputPath', 'provenance', 'capturedAt', 'previousMinorUnits']);
    if (typeof input.sourceId !== 'string' || !/^[a-z0-9-]{2,40}$/.test(input.sourceId) || seen.has(input.sourceId)) throw new Error('Invalid source id');
    seen.add(input.sourceId);
    if (typeof input.inputPath !== 'string' || input.inputPath.length > 240 || path.isAbsolute(input.inputPath) || input.inputPath.includes('..')) throw new Error('Invalid input path');
    if (input.provenance !== 'synthetic' && input.provenance !== 'manual-fixture') throw new Error('Invalid provenance');
    if (typeof input.capturedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input.capturedAt) || !Number.isFinite(Date.parse(input.capturedAt))) throw new Error('Invalid capture time');
    const canonicalCapture = input.capturedAt.includes('.')
      ? input.capturedAt.replace(/\.(\d{1,3})Z$/, (_, fraction: string) => `.${fraction.padEnd(3, '0')}Z`)
      : input.capturedAt.replace(/Z$/, '.000Z');
    if (new Date(input.capturedAt).toISOString() !== canonicalCapture) throw new Error('Invalid capture time');
    let previousMinorUnits: Record<string, string> | undefined;
    if (input.previousMinorUnits !== undefined) {
      const baselines = record(input.previousMinorUnits);
      if (Object.keys(baselines).length > MAX_PLANS) throw new Error('Invalid baseline');
      previousMinorUnits = {};
      for (const [name, amount] of Object.entries(baselines)) {
        if (!/^[A-Za-z][A-Za-z0-9 -]{0,39}$/.test(name) || typeof amount !== 'string' || !/^(0|[1-9]\d{0,11})$/.test(amount)) throw new Error('Invalid baseline');
        previousMinorUnits[name] = amount;
      }
    }
    return { sourceId: input.sourceId, inputPath: input.inputPath, provenance: input.provenance, capturedAt: input.capturedAt, ...(previousMinorUnits ? { previousMinorUnits } : {}) };
  });
  return { version: 1, sources };
}

async function registry(): Promise<Map<string, Source>> {
  if (!(await stat(SOURCES_FILE)).isFile()) throw new Error('Invalid source registry');
  return validateSourceRegistry(load(await readFile(SOURCES_FILE, 'utf8')) as unknown);
}

export function validateSourceRegistry(value: unknown): Map<string, Source> {
  const root = record(value);
  exactKeys(root, ['version', 'sources']);
  if (root.version !== 1 || !Array.isArray(root.sources) || root.sources.length !== 2 || root.sources.length > MAX_SOURCES) throw new Error('Invalid source registry');
  const sources = new Map<string, Source>();
  for (const raw of root.sources) {
    const item = record(raw);
    exactKeys(item, ['id', 'name', 'source_url', 'live_enabled', 'terms_decision', 'extractor_version', 'plans']);
    const sourceUrls: Record<string, string> = { 'storytel-se': 'https://www.storytel.com/se/subscriptions', 'bookbeat-se': 'https://www.bookbeat.com/se' };
    if (typeof item.id !== 'string' || !Object.hasOwn(sourceUrls, item.id) || typeof item.name !== 'string' || item.name.length > 80 || typeof item.source_url !== 'string' || item.source_url !== sourceUrls[item.id] || item.live_enabled !== false || item.terms_decision !== 'unresolved' || typeof item.extractor_version !== 'string' || !/^[a-z0-9-]{2,40}$/.test(item.extractor_version) || !Array.isArray(item.plans) || item.plans.length < 2 || item.plans.length > MAX_PLANS) throw new Error('Invalid source registry');
    const plans = item.plans.map((rawPlan): Plan => {
      const plan = record(rawPlan);
      exactKeys(plan, ['name', 'anchor']);
      if (typeof plan.name !== 'string' || !/^[A-Za-z][A-Za-z0-9 -]{0,39}$/.test(plan.name) || typeof plan.anchor !== 'string' || plan.anchor.length > 80 || !/^\[[a-zA-Z0-9_-]+="[a-zA-Z0-9_-]+"\]$/.test(plan.anchor)) throw new Error('Invalid source registry');
      return { name: plan.name, anchor: plan.anchor };
    });
    if (sources.has(item.id) || new Set(plans.map((plan) => plan.name)).size !== plans.length || new Set(plans.map((plan) => plan.anchor)).size !== plans.length) throw new Error('Invalid source registry');
    sources.set(item.id, { id: item.id, name: item.name, source_url: item.source_url, live_enabled: false, terms_decision: 'unresolved', extractor_version: item.extractor_version, plans });
  }
  return sources;
}

function parsePrice(text: string, plan: string): bigint {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const escapedPlan = plan.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escapedPlan} (\\d{1,6}) (?:SEK\\s*/\\s*(?:mån(?:ad)?|month)|kr\\s*/\\s*(?:mån(?:ad)?|month)|(?:SEK|kr)\\s+per\\s+(?:månad|month))$`, 'i').exec(normalized);
  const wholeSek = match?.[1];
  if (!wholeSek || BigInt(wholeSek) === 0n) throw new Error('Price missing or ambiguous');
  return multiply(money(BigInt(wholeSek), 'SEK'), 100n).minorUnits;
}

async function readLocalHtml(manifestPath: string, inputPath: string): Promise<{ bytes: Buffer; hash: string; path: string }> {
  const root = await realpath(path.dirname(manifestPath));
  const candidate = await realpath(path.resolve(root, inputPath));
  if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('Input path is outside manifest directory');
  const details = await stat(candidate);
  if (!details.isFile() || details.size > MAX_HTML_BYTES) throw new Error('HTML input exceeds size limit');
  const handle = await open(candidate, 'r');
  let bytes: Buffer;
  try {
    const buffer = Buffer.alloc(MAX_HTML_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    bytes = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error('HTML input exceeds size limit');
  return { bytes, hash: createHash('sha256').update(bytes).digest('hex'), path: candidate };
}

async function extract(context: BrowserContext, source: Source, html: string): Promise<Observation[]> {
  const page = await context.newPage();
  try {
    const isolatedDocument = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src 'none'; form-action 'none'; frame-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; navigate-to 'none'"></head><body>${html}</body></html>`;
    await page.setContent(isolatedDocument, { waitUntil: 'domcontentloaded', timeout: 5_000 });
    // Refresh may destroy the document even with navigation aborted. Quarantine
    // the complete source before extracting any prices from hostile markup.
    if (await page.locator('meta[http-equiv]').evaluateAll((nodes) => nodes.some((node) => node.getAttribute('http-equiv')?.toLowerCase() === 'refresh'))) throw new Error('Refresh navigation rejected');
    if (page.frames().some((frame) => frame.url().startsWith('file:'))) throw new Error('Local file frame rejected');
    const rows: Observation[] = [];
    for (const plan of source.plans) {
      const nodes = page.locator(plan.anchor);
      if (await nodes.count() !== 1) throw new Error(`Plan ${plan.name}: anchor missing or ambiguous`);
      const text = await nodes.first().innerText({ timeout: 1_000 });
      rows.push({ plan: plan.name, currency: 'SEK', minorUnits: parsePrice(text, plan.name).toString() });
    }
    return rows;
  } finally {
    await page.close();
  }
}

function quarantineChanges(rows: Observation[], input: Input): { accepted: Observation[]; quarantined: Result['quarantined'] } {
  const accepted: Observation[] = [];
  const quarantined: Result['quarantined'] = [];
  for (const row of rows) {
    const baseline = input.previousMinorUnits?.[row.plan];
    if (baseline === undefined || baseline === '0') {
      quarantined.push({ ...row, reason: baseline === '0' ? 'invalid_baseline' : 'baseline_missing' });
      continue;
    }
    const currentMoney = money(BigInt(row.minorUnits), 'SEK');
    const baselineMoney = money(BigInt(baseline), 'SEK');
    const delta = currentMoney.minorUnits >= baselineMoney.minorUnits ? subtract(currentMoney, baselineMoney) : subtract(baselineMoney, currentMoney);
    if (greaterThan(multiply(delta, 100n), multiply(baselineMoney, 40n))) quarantined.push({ ...row, reason: 'change_over_40_percent' });
    else accepted.push(row);
  }
  return { accepted, quarantined };
}

export async function runCatalogueExtraction(manifestFile: string, outputFile: string): Promise<void> {
  const manifestPath = await realpath(manifestFile);
  const outputPath = path.resolve(outputFile);
  const outputRealParent = await realpath(path.dirname(outputPath));
  const resolvedOutput = path.join(outputRealParent, path.basename(outputPath));
  if (resolvedOutput === manifestPath) throw new Error('Output must differ from input files');
  const manifestStat = await stat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.size > MAX_MANIFEST_BYTES) throw new Error('Manifest exceeds size limit');
  const manifestHandle = await open(manifestPath, 'r');
  let manifestBytes: Buffer;
  try {
    const buffer = Buffer.alloc(MAX_MANIFEST_BYTES + 1);
    const { bytesRead } = await manifestHandle.read(buffer, 0, buffer.length, 0);
    manifestBytes = buffer.subarray(0, bytesRead);
  } finally {
    await manifestHandle.close();
  }
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) throw new Error('Manifest exceeds size limit');
  const manifest = parseManifest(JSON.parse(manifestBytes.toString('utf8')) as unknown);
  const registered = await registry();
  const inputs = manifest.sources.map((input) => {
    const source = registered.get(input.sourceId);
    if (!source) throw new Error('Manifest references an unregistered source');
    if (input.previousMinorUnits && Object.keys(input.previousMinorUnits).some((plan) => !source.plans.some((entry) => entry.name === plan))) throw new Error('Baseline references an unknown plan');
    return { input, source };
  });
  const files = await Promise.all(inputs.map(({ input }) => readLocalHtml(manifestPath, input.inputPath)));
  if (files.some(({ path: inputPath }) => resolvedOutput === inputPath || inputPath === manifestPath)) throw new Error('Output and inputs must be distinct files');
  let context: BrowserContext | undefined;
  const results: Result[] = [];
  const browser = await chromium.launch({ headless: true });
    try {
      context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
      await context.route('**/*', (route) => route.abort());
      for (let i = 0; i < inputs.length; i += 1) {
        const item = inputs[i];
        const file = files[i];
        if (!item || !file) throw new Error('Input processing failed');
        const { input, source } = item;
        const base = { sourceId: source.id, sourceUrl: source.source_url, extractorVersion: source.extractor_version, inputSha256: file.hash, capturedAt: input.capturedAt, provenance: input.provenance, marketPriceVerified: false as const };
        try {
          const extracted = await extract(context, source, file.bytes.toString('utf8'));
          const change = quarantineChanges(extracted, input);
          results.push({ ...base, observations: change.accepted, quarantined: change.quarantined });
        } catch {
          results.push({ ...base, observations: [], quarantined: [{ plan: '*', reason: 'source_extraction_failed' }] });
        }
      }
    } finally {
      try {
        await context?.close();
      } finally {
        await browser.close();
      }
    }
  await writeFile(resolvedOutput, `${JSON.stringify({ version: 1, results }, null, 2)}\n`, { flag: 'wx' });
}
