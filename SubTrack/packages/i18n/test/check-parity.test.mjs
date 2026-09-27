import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const checker = join(packageRoot, 'scripts/check-parity.mjs');
const dir = await mkdtemp(join(tmpdir(), 'subtrack-i18n-'));
try {
  const sv = join(dir, 'sv.json');
  const en = join(dir, 'en.json');
  const run = () =>
    spawnSync(process.execPath, [checker, sv, en], { encoding: 'utf8' });
  const write = async (path, value) => writeFile(path, JSON.stringify(value));

  await write(sv, { nested: { greeting: 'Hej' } });
  await write(en, { nested: { greeting: 'Hello' } });
  assert.equal(run().status, 0, 'matching nested catalogs should pass');

  await write(en, { nested: { other: 'Hello' } });
  let result = run();
  assert.notEqual(result.status, 0, 'missing keys should fail');
  assert.match(result.stderr, /nested\.greeting/);
  assert.match(result.stderr, /nested\.other/);

  await write(en, { nested: 'Hello' });
  result = run();
  assert.notEqual(result.status, 0, 'incompatible nested shape should fail');
  assert.match(result.stderr, /nested/);

  await write(sv, { nested: { greeting: 1 } });
  await write(en, { nested: { greeting: 'Hello' } });
  result = run();
  assert.notEqual(result.status, 0, 'incompatible leaf type should fail');
  assert.match(result.stderr, /nested\.greeting/);

  await write(sv, { greeting: 'Hej {name}' });
  await write(en, { greeting: 'Hello {firstName}' });
  result = run();
  assert.notEqual(result.status, 0, 'different ICU argument names should fail');
  assert.match(result.stderr, /greeting/);
  assert.match(result.stderr, /Mismatched ICU placeholders/);

  await write(sv, { count: '{count, plural, one {# sak} other {# saker}}' });
  await write(en, { count: '{count, select, one {one} other {other}}' });
  result = run();
  assert.notEqual(result.status, 0, 'different ICU argument usage should fail');
  assert.match(result.stderr, /count/);

  const { en: english, sv: swedish, catalogs } = await import('@subtrack/i18n');
  assert.equal(english.navigation.home, 'Home');
  assert.equal(swedish.navigation.home, 'Hem');
  assert.equal(catalogs.en.navigation.home, 'Home');
  assert.equal(catalogs.sv.navigation.home, 'Hem');
  console.log(
    'i18n parity tests passed (matching, missing key, nested shape, leaf type, ICU placeholders, package exports).',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
