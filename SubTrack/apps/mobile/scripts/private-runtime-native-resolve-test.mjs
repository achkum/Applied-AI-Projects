import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeGradlePluginResolution } from './private-runtime-native-resolve.mjs';

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
