/* global __dirname, module, require, process */
/* eslint-disable @typescript-eslint/no-require-imports -- Expo SDK 51 loads Metro configs as CommonJS. */
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
// Serve pnpm workspace entry URLs relative to the same root Metro resolves.
if (process.env.EXPO_USE_METRO_WORKSPACE_ROOT === '1') {
  config.server.unstable_serverRoot = monorepoRoot;
  config.transformer._expoRelativeProjectRoot = path.relative(monorepoRoot, projectRoot);
}
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.resolver.unstable_enablePackageExports = true;
// Resolve the native asset registry from React Native's declared dependency under pnpm.
config.transformer.assetRegistryPath = require.resolve('@react-native/assets-registry/registry', {
  paths: [path.dirname(require.resolve('react-native/package.json'))],
});

module.exports = config;
