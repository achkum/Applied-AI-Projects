import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';

test('domain cannot import application code', async () => {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(
    "import '../../../apps/api/package.json';\n",
    { filePath: '../domain/src/boundary-fixture.ts' },
  );
  assert.ok(result);
  assert.ok(
    result.messages.some(
      (message) => message.ruleId === 'boundaries/element-types',
    ),
  );
});

test('public config entry is importable', async () => {
  const { configVersion } = await import('@subtrack/config');
  assert.equal(configVersion, '0.0.0');
});
