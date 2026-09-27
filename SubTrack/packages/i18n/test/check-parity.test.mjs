import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  const run = () => spawnSync(process.execPath, [checker, sv, en], { encoding: 'utf8' });
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

  const source = await readFile(join(packageRoot, 'src/index.ts'), 'utf8');
  assert.match(source, /import en from '\.\.\/catalogs\/en\.json'/);
  assert.match(source, /import sv from '\.\.\/catalogs\/sv\.json'/);
  console.log('i18n parity tests passed (matching, missing key, nested shape, leaf type, exports).');
} finally {
  await rm(dir, { recursive: true, force: true });
}
