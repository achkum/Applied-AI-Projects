import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { ESLint } from 'eslint';

test('domain and money cannot import I/O layers', async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  });
  for (const source of ['domain', 'money']) {
    const filePath = fileURLToPath(
      new URL(`../../${source}/src/fixture.ts`, import.meta.url),
    );
    for (const target of [
      'apps/web',
      'apps/mobile',
      'apps/api',
      'services/worker',
      'packages/llm-gateway',
      'packages/catalog',
      'packages/synthetic',
    ]) {
      const [result] = await eslint.lintText(
        `import '../../../${target}/package.json';\n`,
        { filePath },
      );
      assert.ok(
        result?.messages.some(
          (message) => message.ruleId === 'boundaries/element-types',
        ),
        `${source} -> ${target}`,
      );
    }
  }
});

test('pure packages reject Node and framework imports', async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  });
  for (const source of ['domain', 'money']) {
    const filePath = fileURLToPath(
      new URL(`../../${source}/src/fixture.ts`, import.meta.url),
    );
    for (const target of ['node:fs', 'react']) {
      const [result] = await eslint.lintText(`import '${target}';\n`, {
        filePath,
      });
      assert.ok(
        result?.messages.some(
          (message) => message.ruleId === 'boundaries/external',
        ),
        `${source} -> ${target}`,
      );
    }
  }
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
      'packages/catalog',
      'packages/synthetic',
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
    for (const target of ['config', 'contracts', 'i18n', 'ui', 'ui-tokens']) {
      const [allowed] = await eslint.lintText(
        `import '../../../packages/${target}/package.json';\n`,
        { filePath },
      );
      assert.ok(
        allowed &&
          !allowed.messages.some(
            (message) => message.ruleId === 'boundaries/element-types',
          ),
        `${client} -> ${target}`,
      );
    }
  }
});

test('public config entry is importable', async () => {
  const { configVersion } = await import('@subtrack/config');
  assert.equal(configVersion, '0.0.0');
});
