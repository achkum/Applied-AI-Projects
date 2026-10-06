module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./jest.setup.js'],
  // jest-expo's default transformIgnorePatterns anchors on the segment right
  // after "node_modules/", which breaks under pnpm's nested
  // node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg> layout. Use `.*`
  // lookahead prefixes so RN/Expo packages are still transformed regardless
  // of pnpm's store path depth.
  transformIgnorePatterns: [
    'node_modules/(?!.*(?:jest-)?react-native|.*@react-native(?:-community)?|.*expo(?:nent)?|.*@expo(?:nent)?/.*|.*@expo-google-fonts/.*|.*react-navigation|.*@react-navigation/.*|.*@unimodules/.*|.*unimodules|.*sentry-expo|.*native-base|.*react-native-svg)',
    '/node_modules/react-native-reanimated/plugin/',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // @subtrack/ui-tokens/member-accent uses `import … with { type: 'json' }` (JSON import
    // attributes) which babel-preset-expo 10 does not transform. Map to a CJS shim for Jest.
    '^@subtrack/ui-tokens/member-accent$': '<rootDir>/src/__jest__/memberAccentForId.js',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', '**/**.test.ts', '**/**.test.tsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
};
