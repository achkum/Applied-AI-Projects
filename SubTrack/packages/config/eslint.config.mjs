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
        { type: 'package', pattern: 'packages/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            { from: 'domain', disallow: ['web', 'mobile', 'api', 'service'] },
            { from: 'money', disallow: ['web', 'mobile', 'api', 'service'] },
            {
              from: ['web', 'mobile'],
              disallow: ['api', 'service', 'domain', 'money', 'llm-gateway'],
            },
          ],
        },
      ],
    },
  },
];
