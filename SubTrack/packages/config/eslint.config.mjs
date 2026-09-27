import eslint from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '_legacy/**',
      'docs/**',
      '.sdlc/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'web', pattern: 'apps/web' },
        { type: 'mobile', pattern: 'apps/mobile' },
        { type: 'api', pattern: 'apps/api' },
        { type: 'service', pattern: 'services/*' },
        { type: 'domain', pattern: 'packages/domain' },
        { type: 'money', pattern: 'packages/money' },
        { type: 'llm-gateway', pattern: 'packages/llm-gateway' },
        { type: 'config', pattern: 'packages/config' },
        { type: 'contracts', pattern: 'packages/contracts' },
        { type: 'catalog', pattern: 'packages/catalog' },
        { type: 'synthetic', pattern: 'packages/synthetic' },
        { type: 'i18n', pattern: 'packages/i18n' },
        { type: 'ui', pattern: 'packages/ui' },
        { type: 'ui-tokens', pattern: 'packages/ui-tokens' },
        { type: 'package', pattern: 'packages/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: 'web',
              allow: ['web', 'config', 'contracts', 'i18n', 'ui', 'ui-tokens'],
            },
            {
              from: 'mobile',
              allow: [
                'mobile',
                'config',
                'contracts',
                'i18n',
                'ui',
                'ui-tokens',
              ],
            },
            {
              from: 'domain',
              allow: ['domain', 'money', 'config', 'contracts'],
            },
            {
              from: 'money',
              allow: ['money', 'config', 'contracts'],
            },
            {
              from: [
                'api',
                'service',
                'llm-gateway',
                'config',
                'contracts',
                'catalog',
                'synthetic',
                'i18n',
                'ui',
                'ui-tokens',
                'package',
              ],
              allow: ['*'],
            },
          ],
        },
      ],
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          rules: [{ from: ['domain', 'money'], disallow: ['*'] }],
        },
      ],
    },
  },
];
