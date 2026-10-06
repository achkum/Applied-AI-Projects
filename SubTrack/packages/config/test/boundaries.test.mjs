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

test('client boundaries cover relative static re-exports', async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  });
  const statements = (path) => [
    `export * from '${path}';`,
    `export { fixture } from '${path}';`,
    `export type { Fixture } from '${path}';`,
  ];
  for (const client of ['web', 'mobile']) {
    const filePath = fileURLToPath(
      new URL(`../../../apps/${client}/src/fixture.ts`, import.meta.url),
    );
    const otherClient = client === 'web' ? 'mobile' : 'web';
    for (const target of [
      `apps/${otherClient}`,
      'apps/api',
      'services/worker',
      'packages/domain',
      'packages/money',
      'packages/llm-gateway',
      'packages/catalog',
      'packages/synthetic',
    ]) {
      for (const statement of statements(`../../../${target}/package.json`)) {
        const [result] = await eslint.lintText(`${statement}\n`, { filePath });
        assert.ok(
          result?.messages.some(
            (message) => message.ruleId === 'boundaries/element-types',
          ),
          `${client}: ${statement}`,
        );
      }
    }
    for (const target of ['config', 'contracts', 'i18n', 'ui', 'ui-tokens']) {
      for (const statement of statements(
        `../../../packages/${target}/package.json`,
      )) {
        const [result] = await eslint.lintText(`${statement}\n`, { filePath });
        assert.ok(
          result &&
            !result.messages.some(
              (message) => message.ruleId === 'boundaries/element-types',
            ),
          `${client}: ${statement}`,
        );
      }
    }
    for (const statement of statements('./fixture.ts')) {
      const [result] = await eslint.lintText(`${statement}\n`, { filePath });
      assert.ok(
        result &&
          !result.messages.some(
            (message) => message.ruleId === 'boundaries/element-types',
          ),
        `${client}: ${statement}`,
      );
    }
  }
});

test('clients reject every unapproved static workspace alias', async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  });
  for (const client of ['web', 'mobile']) {
    const filePath = fileURLToPath(
      new URL(`../../../apps/${client}/src/fixture.ts`, import.meta.url),
    );
    const otherClient = client === 'web' ? 'mobile' : 'web';
    for (const target of [
      otherClient,
      'api',
      'domain',
      'money',
      'llm-gateway',
      'catalog',
      'synthetic',
      'worker',
      'ml',
      'future-private',
      'ui-private',
    ]) {
      for (const suffix of ['', '/private']) {
        for (const statement of [
          `import '@subtrack/${target}${suffix}';`,
          `export * from '@subtrack/${target}${suffix}';`,
        ]) {
          const [result] = await eslint.lintText(`${statement}\n`, {
            filePath,
          });
          assert.ok(
            result?.messages.some(
              (message) => message.ruleId === 'no-restricted-imports',
            ),
            `${client}: ${statement}`,
          );
        }
      }
    }
    for (const target of [
      client,
      'config',
      'contracts',
      'i18n',
      'ui',
      'ui-tokens',
    ]) {
      for (const suffix of ['', '/public']) {
        for (const statement of [
          `import '@subtrack/${target}${suffix}';`,
          `export * from '@subtrack/${target}${suffix}';`,
        ]) {
          const [result] = await eslint.lintText(`${statement}\n`, {
            filePath,
          });
          assert.ok(
            result &&
              !result.messages.some(
                (message) => message.ruleId === 'no-restricted-imports',
              ),
            `${client}: ${statement}`,
          );
        }
      }
    }
  }
});

test('public config entry is importable', async () => {
  const { configVersion } = await import('@subtrack/config');
  assert.equal(configVersion, '0.0.0');
});

test('web may import the approved demo display JSON subpath only through UI', async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  });
  const filePath = fileURLToPath(
    new URL('../../../apps/web/app/[locale]/demo/demo-screen.tsx', import.meta.url),
  );
  const [approved] = await eslint.lintText(
    "import demo from '@subtrack/ui/demo-fixture';\n",
    { filePath },
  );
  assert.ok(
    approved &&
      !approved.messages.some((message) =>
        ['boundaries/element-types', 'no-restricted-imports'].includes(message.ruleId ?? ''),
      ),
  );
  for (const target of ['@subtrack/money', '@subtrack/synthetic']) {
    const [denied] = await eslint.lintText(`import '${target}';\n`, { filePath });
    assert.ok(
      denied?.messages.some((message) =>
        ['boundaries/external', 'no-restricted-imports'].includes(message.ruleId ?? ''),
      ),
      target,
    );
  }
});


test('mobile demo may import the approved display JSON subpath and rejects money/synthetic boundaries', async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  });
  const filePath = fileURLToPath(
    new URL('../../../apps/mobile/src/components/DemoHouseholdScreen.tsx', import.meta.url),
  );
  const [approved] = await eslint.lintText(
    "import demo from '@subtrack/i18n/catalogs/demo-fixture';\n",
    { filePath },
  );
  assert.ok(
    approved &&
      !approved.messages.some((message) =>
        ['boundaries/element-types', 'no-restricted-imports'].includes(message.ruleId ?? ''),
      ),
  );
  for (const target of ['@subtrack/money', '@subtrack/synthetic']) {
    for (const statement of [`import '${target}';\n`, `export * from '${target}';\n`]) {
      const [denied] = await eslint.lintText(statement, { filePath });
      assert.ok(
        denied?.messages.some((message) =>
          ['boundaries/external', 'no-restricted-imports'].includes(message.ruleId ?? ''),
        ),
        statement,
      );
    }
  }
});
