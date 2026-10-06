import eslint from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
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
      'boundaries/dependency-nodes': ['import', 'export'],
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
          rules: [
            { from: ['domain', 'money'], disallow: ['*'] },
            {
              from: ['web', 'mobile'],
              disallow: [
                '@subtrack/api',
                '@subtrack/domain',
                '@subtrack/money',
                '@subtrack/llm-gateway',
                '@subtrack/catalog',
                '@subtrack/synthetic',
                '@subtrack/worker',
              ],
            },
          ],
        },
      ],
    },
  },
  // Static workspace aliases are unresolved by boundaries/external until a
  // package exists on disk. Match the namespace instead of enumerating today's
  // packages so future server-side aliases remain denied in clients.
  {
    files: ['apps/web/**/*.{js,mjs,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^@subtrack/(?!(?:web|config|contracts|i18n|ui|ui-tokens)(?:/|$))',
              message:
                'Web may import only client-approved @subtrack packages.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/mobile/**/*.{js,mjs,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^@subtrack/(?!(?:mobile|config|contracts|i18n|ui|ui-tokens)(?:/|$))',
              message:
                'Mobile may import only client-approved @subtrack packages.',
            },
          ],
        },
      ],
    },
  },
];
