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
];
