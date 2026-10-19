import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import {createRequire} from 'node:module';
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

test('both native platforms wait for committed Welcome before each original cold-start deep link and verification',()=>{
 const mobile=createRequire(new URL('../package.json',import.meta.url)),yaml=createRequire(mobile.resolve('expo/package.json'))('yaml');
 for(const name of ['restart','edit-status','edit-status-api-restart','bank-retain','bank-cancel','bank-final']){
  const flow=readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.ok(flow.includes('- stopApp\n- launchApp\n- extendedWaitUntil:\n    visible: ${MAESTRO_CREATE_ACCOUNT}\n    timeout: 120000\n- openLink: subtrack:///personal\n- extendedWaitUntil:\n    visible:\n      id: native-personal-login\n    timeout: 30000'));
  const [config,steps]=yaml.parseAllDocuments(flow).map(document=>document.toJSON()),at=steps.indexOf('launchApp');assert.equal(config.appId,'se.subtrack.app');assert.ok(at>0);
  assert.deepEqual(steps.slice(at-1,at+4),['stopApp','launchApp',{extendedWaitUntil:{visible:'${MAESTRO_CREATE_ACCOUNT}',timeout:120000}},{openLink:'subtrack:///personal'},{extendedWaitUntil:{visible:{id:'native-personal-login'},timeout:30000}}],name);
  assert.ok(!flow.includes('platform: Android'),name);
  assert.equal(flow.split('- launchApp').length-1,1);
  assert.equal(flow.includes('clearState: true'),false);
 }
});
