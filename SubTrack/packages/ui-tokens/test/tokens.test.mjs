import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateContrast } from '../scripts/contrast.mjs';
import { memberAccentForId } from '../src/member-accent.mjs';
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
  const prettier = spawnSync(
    path.join(root, '../../node_modules/.bin/prettier'),
    ['--stdin-filepath', path.join(root, 'generated/theme.native.json')],
    { input: after[1], encoding: 'utf8' },
  );
  assert.equal(prettier.status, 0, prettier.stderr);
  assert.equal(
    after[1],
    prettier.stdout,
    'generated native JSON must be Prettier-formatted',
  );
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
  const memberSlots = Object.entries(source.memberAccent.slots);
  assert.equal(memberSlots.length, 8);
  const switcherStates = source.memberAccent.scopeSwitcherStates;
  assert.deepEqual(theme.memberAccent.scopeSwitcherStates, switcherStates);
  assert.deepEqual(Object.keys(switcherStates), ['selected', 'unselected']);
  assert.deepEqual(
    [switcherStates.selected.surface, switcherStates.unselected.surface],
    ['bg.raised', 'bg.sunken'],
  );
  for (const state of Object.values(switcherStates)) {
    assert.equal(state.foreground, 'ink.primary');
    assert.equal(state.identityMark, 'member.accent');
    for (const mode of ['light', 'dark']) {
      assert.ok(Object.hasOwn(source.color[mode], state.surface));
      assert.ok(
        source.contrastPairs.some(
          (pair) =>
            pair.foreground === state.foreground &&
            pair.background === state.surface,
        ),
      );
    }
  }
  assert.equal(switcherStates.selected.selectionIndicator, 'checkmark');
  assert.equal(switcherStates.selected.selectionIndicatorStrokeWidthPx, 2);
  assert.equal(switcherStates.selected.accessibilitySelected, true);
  assert.equal(switcherStates.unselected.selectionIndicator, 'none');
  assert.equal(switcherStates.unselected.selectionIndicatorStrokeWidthPx, 0);
  assert.equal(switcherStates.unselected.accessibilitySelected, false);
  for (const [state, values] of Object.entries(switcherStates))
    assert.match(
      css,
      new RegExp(
        `--scope-switcher-${state}-indicator-stroke-width: ${values.selectionIndicatorStrokeWidthPx}px;`,
      ),
    );
  assert.deepEqual(
    Object.keys(theme.memberAccent.slots),
    memberSlots.map(([name]) => name),
  );
  for (const [name, values] of memberSlots) {
    assert.deepEqual(theme.memberAccent.slots[name], values);
    for (const mode of ['light', 'dark'])
      assert.match(
        css,
        new RegExp(
          `--${name.replaceAll('.', '-')}: ${values[mode].toLowerCase()};`,
        ),
      );
  }
  assert.equal(
    memberAccentForId('opaque-member-id-1'),
    memberAccentForId('opaque-member-id-1'),
  );
  assert.ok(
    Object.hasOwn(
      source.memberAccent.slots,
      memberAccentForId('opaque-member-id-1'),
    ),
  );
  assert.notEqual(
    memberAccentForId('opaque-member-id-1'),
    memberAccentForId('opaque-member-id-2'),
  );
  assert.throws(() => memberAccentForId(''), /non-empty string/);
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
test('contrast command validates text AA pairs and member accents on both switcher surfaces in both themes', () => {
  const result = run('scripts/check-contrast.mjs');
  assert.equal(result.status, 0, result.stderr);
});
test('contrast command rejects a member accent indistinguishable from bg.sunken', async () => {
  const tokens = JSON.parse(
    await readFile(path.join(root, 'src/tokens.json'), 'utf8'),
  );
  tokens.memberAccent.slots['member.accent.01'].dark =
    tokens.color.dark['bg.sunken'];
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'ui-member-sunken-contrast-'),
  );
  const input = path.join(directory, 'tokens.json');
  try {
    await writeFile(input, JSON.stringify(tokens));
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/check-contrast.mjs'), input],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /dark: member\.accent\.01 on bg\.sunken/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('contrast command rejects an inaccessible member accent in either theme', async () => {
  const tokens = JSON.parse(
    await readFile(path.join(root, 'src/tokens.json'), 'utf8'),
  );
  tokens.memberAccent.slots['member.accent.01'].dark = '#12162A';
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'ui-member-contrast-'),
  );
  const input = path.join(directory, 'tokens.json');
  try {
    await writeFile(input, JSON.stringify(tokens));
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/check-contrast.mjs'), input],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /dark: member\.accent\.01 on bg\.raised/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
