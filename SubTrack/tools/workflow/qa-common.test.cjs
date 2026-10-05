'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseOpaqueRgb,
  relativeLuminance,
  contrastRatio,
  normalizeVisibleText,
} = require('./qa-common.cjs');
const { validateOptions, requireUnique } = require('./storybook-canary.cjs');

test('WCAG sRGB transfer curve and contrast ratio', () => {
  assert.deepEqual(parseOpaqueRgb('#abc'), [170, 187, 204]);
  assert.equal(relativeLuminance('#000'), 0);
  assert.equal(relativeLuminance('#fff'), 1);
  assert.ok(Math.abs(contrastRatio('#000', '#fff') - 21) < 1e-12);
  assert.ok(
    Math.abs(relativeLuminance('rgb(10, 10, 10)') - 0.003035269835488375) <
      1e-14,
  );
  assert.ok(
    Math.abs(relativeLuminance('rgb(128, 128, 128)') - 0.21586050011389923) <
      1e-14,
  );
  assert.ok(
    Math.abs(contrastRatio('#808080', '#fff') - 3.9494396480491156) < 1e-12,
  );
});

test('rejects colors whose opacity or syntax cannot be evaluated safely', () => {
  for (const color of [
    'rgba(0,0,0,1)',
    'rgb(0 0 0)',
    '#abcd',
    'transparent',
    'rgb(256,0,0)',
  ]) {
    assert.throws(() => relativeLuminance(color));
  }
});

test('normalizes layout whitespace without changing currency NBSP', () => {
  assert.equal(normalizeVisibleText('  1\t234\n kr '), '1 234 kr ');
  assert.notEqual(normalizeVisibleText('10 kr'), normalizeVisibleText('10 kr'));
});

test('canary accepts loopback semantic selectors and rejects class selectors', () => {
  const valid = {
    baseUrl: 'http://127.0.0.1:6006',
    storyId: 'demo--story',
    selector: 'role=button[name="Save"]',
  };
  assert.ok(validateOptions(valid));
  assert.ok(validateOptions({ ...valid, selector: 'text=Netflix.com' }));
  assert.throws(
    () => validateOptions({ ...valid, selector: '.Button_primary__a1b2' }),
    /semantic selector/,
  );
  assert.throws(
    () => validateOptions({ ...valid, selector: 'svg' }),
    /semantic selector/,
  );
  assert.throws(
    () => validateOptions({ ...valid, baseUrl: 'https://example.com' }),
    /loopback/,
  );
});

test('canary rejects missing and ambiguous selectors', () => {
  assert.throws(() => requireUnique(0), /matched 0/);
  assert.throws(() => requireUnique(2), /matched 2/);
  assert.doesNotThrow(() => requireUnique(1));
});
