import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { ESLint } from 'eslint';

test('domain cannot import application code', async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  });
  const [result] = await eslint.lintText(
    "import '../../../apps/api/package.json';\n",
    {
      filePath: fileURLToPath(
        new URL('../../domain/src/boundary-fixture.ts', import.meta.url),
      ),
    },
  );
  assert.ok(result);
  assert.ok(
    result.messages.some(
      (message) => message.ruleId === 'boundaries/element-types',
    ),
  );
});

test('clients cannot import server-side layers directly', async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  });
  for (const client of ['web', 'mobile']) {
    const filePath = fileURLToPath(
      new URL(`../../../apps/${client}/src/fixture.ts`, import.meta.url),
    );
    for (const target of [
      'apps/api',
      'services/worker',
      'packages/domain',
      'packages/money',
      'packages/llm-gateway',
    ]) {
      const [result] = await eslint.lintText(
        `import '../../../${target}/package.json';\n`,
        { filePath },
      );
      assert.ok(
        result?.messages.some(
          (message) => message.ruleId === 'boundaries/element-types',
        ),
        `${client} -> ${target}`,
      );
    }
    const [allowed] = await eslint.lintText(
      "import '../../../packages/contracts/package.json';\n",
      { filePath },
    );
    assert.ok(
      allowed &&
        !allowed.messages.some(
          (message) => message.ruleId === 'boundaries/element-types',
        ),
    );
  }
});

test('public config entry is importable', async () => {
  const { configVersion } = await import('@subtrack/config');
  assert.equal(configVersion, '0.0.0');
});
