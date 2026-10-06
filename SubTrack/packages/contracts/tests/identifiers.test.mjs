import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../identifiers.ts');

test('shared identifier normalization validates and canonicalizes both channels', () => {
  const script = `import { normalizeIdentifier } from ${JSON.stringify(new URL(`file://${source}`).href)};\n` +
    `const cases = [\n` +
    `  [normalizeIdentifier('email', ' User@EXAMPLE.com '), { valid: true, channel: 'email', identifier: 'User@example.com' }],\n` +
    `  [normalizeIdentifier('phone', '070 123 45 67'), { valid: true, channel: 'phone', identifier: '+46701234567' }],\n` +
    `  [normalizeIdentifier('email', 'bad address'), { valid: false, code: 'email_format' }],\n` +
    `];\n` +
    `for (const [actual, expected] of cases) { if (JSON.stringify(actual) !== JSON.stringify(expected)) process.exit(1); }`;
  const run = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
