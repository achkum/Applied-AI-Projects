import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateContrast } from '../scripts/contrast.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (file) =>
  spawnSync(process.execPath, [path.join(root, file)], { encoding: 'utf8' });
test('generation is deterministic and produces exactly 22 evenly spaced category hues', async () => {
  assert.equal(run('scripts/generate.mjs').status, 0);
  const before = await Promise.all(
    ['tokens.css', 'theme.native.json'].map((name) =>
      readFile(path.join(root, 'generated', name), 'utf8'),
    ),
  );
  assert.equal(run('scripts/generate.mjs').status, 0);
  const after = await Promise.all(
    ['tokens.css', 'theme.native.json'].map((name) =>
      readFile(path.join(root, 'generated', name), 'utf8'),
    ),
  );
  assert.deepEqual(after, before);
  const theme = JSON.parse(after[1]);
  const css = after[0];
  const source = JSON.parse(
    await readFile(path.join(root, 'src/tokens.json'), 'utf8'),
  );
  assert.equal(
    theme.typography.fontVariantNumeric,
    source.typography.fontVariantNumeric,
  );
  assert.deepEqual(theme.gradient, source.gradient);
  const assignments = Object.values(theme.categoryHue);
  assert.equal(assignments.length, 22);
  assert.deepEqual(
    assignments.map((x) => x.light),
    Array.from(
      { length: 22 },
      (_, i) => `oklch(0.58 0.14 ${Number(((i * 360) / 22).toFixed(4))})`,
    ),
  );
  assert.deepEqual(
    assignments.map((x) => x.dark),
    Array.from(
      { length: 22 },
      (_, i) => `oklch(0.72 0.14 ${Number(((i * 360) / 22).toFixed(4))})`,
    ),
  );
  const codes = Object.keys(theme.categoryHue);
  const categoryVars = [
    ...css.matchAll(/--category-([a-z0-9-]+): (oklch\([^;]+\));/g),
  ];
  assert.equal(categoryVars.length, 44);
  codes.forEach((code) => {
    const cssCode = code.toLowerCase().replaceAll('_', '-');
    const cssValues = [
      ...css.matchAll(
        new RegExp(`--category-${cssCode}: (oklch\\([^;]+\\));`, 'g'),
      ),
    ].map(([, value]) => value);
    assert.deepEqual(cssValues, [
      theme.categoryHue[code].light,
      theme.categoryHue[code].dark,
    ]);
  });
  assert.match(
    css,
    new RegExp(
      `--font-variant-numeric: ${source.typography.fontVariantNumeric};`,
    ),
  );
  assert.match(css, /font-variant-numeric: var\(--font-variant-numeric\);/);
  assert.match(
    css,
    /--gradient-aurora: linear-gradient\(\s*120deg,\s*var\(--aurora-violet\),\s*var\(--aurora-teal\),\s*var\(--aurora-green\)\s*\);/,
  );
  assert.equal(source.gradient.aurora.angleDegrees, 120);
  assert.deepEqual(source.gradient.aurora.stops, [
    'aurora.violet',
    'aurora.teal',
    'aurora.green',
  ]);
});
test('contrast command accepts the declared AA text pairs', () => {
  const result = run('scripts/check-contrast.mjs');
  assert.equal(result.status, 0, result.stderr);
});
test('contrast command exits nonzero and names a failing theme/token pair', async () => {
  const tokens = JSON.parse(
    await readFile(path.join(root, 'src/tokens.json'), 'utf8'),
  );
  tokens.color.light['ink.primary'] = '#777777';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ui-token-contrast-'));
  const input = path.join(directory, 'tokens.json');
  try {
    await writeFile(input, JSON.stringify(tokens));
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/check-contrast.mjs'), input],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /light: ink\.primary on bg\.canvas/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('contrast checker rejects unknown color syntax instead of silently passing', async () => {
  const tokens = JSON.parse(
    await readFile(path.join(root, 'src/tokens.json'), 'utf8'),
  );
  tokens.color.light['ink.primary'] = 'var(--ink)';
  assert.throws(() => validateContrast(tokens), /opaque #RRGGBB/);
});
