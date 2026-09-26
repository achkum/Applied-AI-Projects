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
        { type: 'app', pattern: 'apps/*' },
        { type: 'service', pattern: 'services/*' },
        { type: 'domain', pattern: 'packages/domain' },
        { type: 'money', pattern: 'packages/money' },
        { type: 'package', pattern: 'packages/*' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            { from: 'domain', disallow: ['app', 'service'] },
            { from: 'money', disallow: ['app', 'service'] },
            { from: 'app', disallow: ['service'] },
          ],
        },
      ],
    },
  },
];
