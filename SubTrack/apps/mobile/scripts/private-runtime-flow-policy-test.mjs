import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { initialIdentifierFlow } from './private-runtime-flow-policy.mjs';
test('platform selection and initial flow preserve freshness while keeping all assertions', () => {
  assert.equal(
    initialIdentifierFlow('android'),
    'private-runtime-identifier-android.yaml',
  );
  assert.equal(initialIdentifierFlow('ios'), 'private-runtime-identifier.yaml');
  assert.throws(
    () => initialIdentifierFlow('web'),
    /Unrecognized native platform/,
  );
  const ios = readFileSync(
    new URL('../e2e/private-runtime-identifier.yaml', import.meta.url),
    'utf8',
  );
  const android = readFileSync(
    new URL('../e2e/private-runtime-identifier-android.yaml', import.meta.url),
    'utf8',
  );
  assert.equal(
    android.replace(/\r\n/g, '\n'),
    ios.replace(/\r\n/g, '\n')
      .replace(/- launchApp:\n {4}clearState: true/, '- launchApp')
      .replace('- tapOn: ${MAESTRO_CREATE_ACCOUNT}', '- takeScreenshot: accepted-welcome\n- tapOn: ${MAESTRO_CREATE_ACCOUNT}')
      .replace('- tapOn:\n    id: native-identifier-input', '- takeScreenshot: accepted-signup\n- tapOn:\n    id: native-identifier-input'),
  );
  const build = readFileSync(
    new URL('./private-runtime-build.sh', import.meta.url),
    'utf8',
  );
  const guard = build.indexOf(
    'bash scripts/private-runtime-android.sh owned-device',
  );
  const install = build.indexOf('adb -s emulator-5554 install');
  const clear = build.indexOf(
    'bash scripts/private-runtime-android.sh clear-app',
  );
  const prefs = build.indexOf('adb -s emulator-5554 shell run-as');
  assert.ok(guard > 0 && guard < install && install < clear && clear < prefs);
});
