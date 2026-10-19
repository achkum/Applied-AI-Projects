import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeGradlePluginResolution } from './private-runtime-native-resolve.mjs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const bare = "require.resolve('@react-native/gradle-plugin/package.json')";
const scoped =
  "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })";
const template = `pluginManagement { includeBuild(${bare}) }\nplugins { id("com.facebook.react.settings") }\nincludeBuild(${scoped})`;
test('only the SDK51 bare resolver changes; already scoped resolution is idempotent', () => {
  const expected = template.replace(bare, scoped);
  assert.equal(scopeGradlePluginResolution(template), expected);
  assert.equal(scopeGradlePluginResolution(expected), expected);
});
test('unrecognized/ambiguous native settings fail closed without writing', () => {
  for (const input of [
    null,
    'unknown',
    template.replace(bare, 'unknown'),
    template.replace(scoped, 'unknown'),
    template + bare,
    template + scoped,
  ])
    assert.throws(
      () => scopeGradlePluginResolution(input),
      /Unrecognized native/,
    );
});

test('actual locked SDK54 template is already scoped and remains byte-identical', () => {
  const require = createRequire(import.meta.url);
  const expo = require('expo/package.json');
  assert.equal(expo.version, '54.0.37');
  const archive = path.join(path.dirname(require.resolve('expo/package.json')), 'template.tgz');
  const settings = execFileSync(process.platform === 'win32' ? 'tar.exe' : 'tar',
    ['-xOf', archive, 'package/android/settings.gradle'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  assert.equal(scopeGradlePluginResolution(settings), settings);
  for (const corrupt of [settings + bare, settings + scoped,
    settings.replace('id("expo-autolinking-settings")', 'id("unapproved")'),
    settings.replace('includeBuild(expoAutolinking.reactNativeGradlePlugin)', 'includeBuild(unapproved)')]) {
    assert.throws(() => scopeGradlePluginResolution(corrupt), /Unrecognized native/);
  }
});
