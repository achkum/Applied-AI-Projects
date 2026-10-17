import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { flowEnvironment } from './private-runtime-flow-env.mjs';

const read = name => readFileSync(new URL(`../e2e/private-runtime-${name}.yaml`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('Add types into the searchable category and chooses its suggestion below the actual input', () => {
  const flow = read('enroll-add');
  assert.ok(flow.includes('- tapOn:\n    id: native-subscription-category\n- inputText: ${MAESTRO_CATEGORY}\n- hideKeyboard\n- tapOn:\n    text: ${MAESTRO_CATEGORY}\n    below:\n      id: native-subscription-category'));
  assert.equal(flow.split('- tapOn:\n    id: native-subscription-category').length - 1, 1);
  assert.equal(flow.split('- inputText: ${MAESTRO_CATEGORY}').length - 1, 1);
  assert.equal(flow.split('- tapOn: ${MAESTRO_SAVE_SUBSCRIPTION}').length - 1, 1);
});

test('date selection uses the real calendar day id with only one bounded month-boundary transition', () => {
  const helper = read('pick-renewal-date'), add = read('enroll-add'), edit = read('edit-status');
  assert.ok(add.includes('- tapOn:\n    id: native-subscription-date\n- runFlow: private-runtime-pick-renewal-date.yaml'));
  assert.ok(helper.includes('when:\n      notVisible:\n        id: native-date-${MAESTRO_RENEWAL_DATE}\n    commands:\n      - tapOn: ${MAESTRO_MONTH_NEXT}'));
  assert.equal(helper.split('- tapOn: ${MAESTRO_MONTH_NEXT}').length - 1, 1);
  assert.ok(helper.endsWith('- tapOn:\n    id: native-date-${MAESTRO_RENEWAL_DATE}\n'));
  assert.ok(edit.includes('- tapOn:\n    id: native-subscription-date\n- extendedWaitUntil:\n    visible: ${MAESTRO_DATE_CLEAR}\n    timeout: 30000\n- tapOn: ${MAESTRO_DATE_CLEAR}'));
  assert.doesNotMatch(helper, /repeat:|optional:|inputText:|eraseText|clearState|setDate/);
  assert.doesNotMatch(add, /inputText: \$\{MAESTRO_RENEWAL_DATE\}/);
  assert.equal(edit.split('- tapOn: ${MAESTRO_SAVE_EDIT}').length - 1, 1);
});

test('preferences and acknowledged primary-screen logout traverse the actual Profile destination', () => {
  const helper = read('open-profile'), add = read('enroll-add');
  assert.ok(helper.includes('- tapOn:\n    id: native-nav-profile\n- extendedWaitUntil:\n    visible:\n      id: native-personal-title\n      text: ${MAESTRO_PROFILE_PAGE_TITLE}\n    timeout: 30000'));
  assert.ok(add.includes('- takeScreenshot: accepted-add\n- runFlow: private-runtime-open-profile.yaml'));
  assert.ok(add.includes('- tapOn:\n    id: native-nav-month\n- extendedWaitUntil:\n    visible: ${MAESTRO_SV_MONTH_TITLE}\n    timeout: 30000\n- tapOn:\n    id: native-nav-profile\n- extendedWaitUntil:\n    visible: ${MAESTRO_SV_SAVE_PREFERENCES}'));
  for (const name of ['restart', 'edit-status-api-restart', 'renewals', 'renewals-empty', 'billing-month', 'billing-month-empty']) {
    const flow = read(name);
    assert.ok(flow.includes('- runFlow: private-runtime-open-profile.yaml\n- scrollUntilVisible:\n    element: ${MAESTRO_LOGOUT}\n    direction: DOWN\n- tapOn: ${MAESTRO_LOGOUT}'), name);
    assert.equal(flow.split('- tapOn: ${MAESTRO_LOGOUT}').length - 1, 1);
    assert.ok(flow.includes('visible: ${MAESTRO_LOGOUT_CONFIRMED}\n    timeout: 30000'));
    assert.ok(flow.includes('- assertNotVisible: ${MAESTRO_LOGOUT}'));
    assert.match(flow, /- assertNotVisible: Example streaming/);
  }
  for (const locale of ['en', 'sv']) {
    const c = JSON.parse(readFileSync(new URL(`../../../packages/i18n/catalogs/${locale}.json`, import.meta.url), 'utf8'));
    const env = flowEnvironment(locale);
    assert.equal(env.MAESTRO_PROFILE_PAGE_TITLE, c.onboarding.productNav.profile);
    assert.equal(env.MAESTRO_MONTH_TITLE, c.onboarding.productNav.home);
    assert.equal(env.MAESTRO_DATE_CLEAR, c.onboarding.datePicker.clear);
  }
});

test('row actions are opened before editing and archived controls are examined after cold restarts', () => {
  const edit = read('edit-status');
  assert.ok(edit.includes('visible: Example streaming\n    timeout: 30000\n- tapOn: Example streaming\n- scrollUntilVisible:\n    element: ${MAESTRO_EDIT}'));
  for (const name of ['edit-status', 'edit-status-api-restart']) {
    const flow = read(name);
    assert.ok(flow.includes('visible: Example streaming Plus\n    timeout: 30000\n- tapOn: Example streaming Plus\n- assertVisible: ${MAESTRO_EDIT}'), name);
    const opened = flow.lastIndexOf('- tapOn: Example streaming Plus');
    assert.ok(opened < flow.lastIndexOf('- assertNotVisible: ${MAESTRO_ARCHIVE}'));
    assert.ok(flow.includes('- assertVisible: ${MAESTRO_EXPECTED_AMOUNT}'));
  }
});

test('Upcoming is reached through Home and empty-day selection is asserted without inventing a card', () => {
  for (const name of ['renewals', 'renewals-empty']) {
    assert.ok(read(name).includes('- tapOn:\n    id: native-nav-month\n- extendedWaitUntil:\n    visible: ${MAESTRO_MONTH_TITLE}\n    timeout: 30000\n- scrollUntilVisible:\n    element: ${MAESTRO_RENEWALS_OPEN}\n    direction: DOWN\n- tapOn: ${MAESTRO_RENEWALS_OPEN}'));
  }
  const day = read('month-day');
  assert.ok(!day.includes('MAESTRO_RIBBON_DIRECTION'));
  assert.ok(!day.includes('scrollUntilVisible:'));
  assert.ok(day.includes('direction: LEFT'));
  assert.ok(day.endsWith('- assertVisible:\n    text: ${MAESTRO_MONTH_DAY}\n    selected: true\n'));
  for (const name of ['billing-month', 'billing-month-empty']) {
    const flow = read(name);
    assert.ok(flow.includes('- scrollUntilVisible:\n    element: ${MAESTRO_MONTH_NEXT}\n    direction: DOWN\n# Only an exact previous-month header'));
    assert.ok(!flow.includes('MAESTRO_RIBBON_DIRECTION'));
    assert.equal(flow.split('- runFlow: private-runtime-month-day.yaml').length - 1, 2);
    assert.ok(flow.includes('id: native-month-ribbon\n    direction: DOWN\n- runFlow: private-runtime-month-day.yaml'));
  }
  const empty = read('billing-month-empty');
  assert.equal(empty.split('- assertNotVisible: ${MAESTRO_MONTH_DAY_EMPTY}').length - 1, 2);
  assert.equal(empty.split('- assertNotVisible: Example streaming Plus').length - 1, 3);
  assert.ok(empty.includes('visible: ${MAESTRO_MONTH_EMPTY}'));
});


test('actual recursive YAML directions use pinned Maestro enum literals rather than unevaluated parameters',()=>{
 // Pinned cli2.11 parses direction as ScrollDirection before command.evaluateScripts:
 // https://github.com/mobile-dev-inc/Maestro/blob/cli-2.11.0/maestro-orchestra/src/main/java/maestro/orchestra/yaml/YamlScrollUntilVisible.kt
 const mobileRequire=createRequire(new URL('../package.json',import.meta.url)),yaml=createRequire(mobileRequire.resolve('expo/package.json'))('yaml');
 const validate=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(key==='direction')assert.ok(['UP','DOWN','LEFT','RIGHT'].includes(child),'Maestro direction must deserialize as an enum literal');validate(child);}};
 for(const name of ['billing-month','billing-month-empty','month-day','pick-renewal-date','enroll-add','edit-status'])for(const document of yaml.parseAllDocuments(read(name)))validate(document.toJSON());
 for(const name of ['setup','bank','manage','pages','restart'])for(const document of yaml.parseAllDocuments(readFileSync(new URL(`../e2e/sandbox-product-${name}.yaml`,import.meta.url),'utf8')))validate(document.toJSON());
 assert.throws(()=>validate({runFlow:{commands:[{scrollUntilVisible:{element:{id:'native-month-ribbon'},direction:'${MAESTRO_RIBBON_DIRECTION}'}}]}}),/enum literal/);
 const positive=read('billing-month'),empty=read('billing-month-empty');assert.ok(positive.includes('id: native-month-ribbon\n    direction: UP\n- runFlow: private-runtime-month-day.yaml'));assert.equal(empty.split('id: native-month-ribbon\n    direction: DOWN\n- runFlow: private-runtime-month-day.yaml').length-1,2);
});
