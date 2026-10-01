import config from '@subtrack/config/eslint';

export default [
  ...config,
  {
    files: ['babel.config.js', 'jest.config.js'],
    languageOptions: {
      globals: {
        module: 'writable',
        require: 'readonly',
      },
    },
  },
  {
    files: ['jest.setup.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
      },
    },
  },
  {
    // CJS shims used only inside Jest (moduleNameMapper targets).
    // require()/module.exports are intentional — the real .mjs uses JSON import
    // attributes which babel-preset-expo 10 cannot transform.
    files: ['src/__jest__/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
    languageOptions: {
      globals: {
        module: 'writable',
        require: 'readonly',
      },
    },
  },
];
