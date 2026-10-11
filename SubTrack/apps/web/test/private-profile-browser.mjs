// Actual natural browser driver; no credential bodies, console messages or traces leave task custody.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { setTimeout } from 'node:timers';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import https from 'node:https';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(webDir, 'package.json'));
const { firefox } = require('playwright');
const origin = 'https://localhost:3443';
const locale = process.env.ST237_BROWSER_LOCALE;
const theme = process.env.ST237_BROWSER_THEME;
assert(['sv', 'en'].includes(locale));
assert(['light', 'dark'].includes(theme));
assert(require('playwright/package.json').version === '1.63.0');
const catalog = JSON.parse(fs.readFileSync(path.join(webDir, '../../packages/i18n/catalogs', `${locale}.json`), 'utf8'));
const copy = catalog.onboarding;
const preferenceCopy = catalog.preferences;
const handshake = process.env.ST237_HANDSHAKE_DIR;
assert(handshake && fs.statSync(handshake).isDirectory());
const ca = fs.readFileSync(path.join(handshake, 'ca.crt'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function awaitMarker(name) {
  for (let i = 0; i < 600; i++) { if (fs.existsSync(path.join(handshake, name))) return; await delay(100); }
  throw new Error('handshake');
}
function request(headers, body = '{}', pathname = '/v2/me/profile/read') {
  return new Promise((resolve, reject) => {
    const req = https.request(`${origin}${pathname}`, { method: 'POST', family: 4, ca, headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers } }, res => {
      const parts = []; res.on('data', part => parts.push(part)); res.on('end', () => {
        try { const text = Buffer.concat(parts).toString('utf8');
          resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null });
        } catch (error) { reject(error); }
      });
    });
    req.on('error', error => {
      negativeNetwork = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code) ? error.code :
        ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(error.code) ? 'TLS' : 'OTHER';
      reject(error);
    }); req.end(body);
  });
}
function closedProblem(result, status, code) {
  assert.equal(result.status, status);
  assert.equal(result.headers['content-type'], 'application/problem+json');
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers.pragma, 'no-cache');
  assert.deepEqual(Object.keys(result.body).sort(), ['code', 'status', 'title', 'type']);
  assert.equal(result.body.status, status); assert.equal(result.body.code, code);
}
let phase = 'LAUNCH';
let context;
let profileWire = { patch: 'NONE', read: 'NONE' };
let navigationStatus = 'NONE';
let negativeCase = 'NONE', negativeStatus = 'NONE', negativeNetwork = 'NONE';
const safeStatus = value => [200, 400, 401, 403, 409, 421, 500].includes(value) ? String(value) : 'OTHER';
try {
  context = await firefox.launchPersistentContext(process.env.ST237_TRUSTED_PROFILE, { headless: true });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const screenshotDir = path.resolve(process.env.ST237_SCREENSHOT_DIR);
  fs.mkdirSync(screenshotDir, { mode: 0o700 });
  const capture = async step => { await page.screenshot({ path: path.join(screenshotDir, `${step}.png`), fullPage: true }); };
  const wire = [];
  const credentialNames = new Set();
  let csrf = '';
  let safeWire = true;
  // Keep the one volatile CSRF only in this private driver, never a receipt or storage artifact.
  page.on('response', async response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/v2/')) return;
    try {
      const headers = await response.allHeaders();
      if (headers['cache-control'] !== 'no-store' || headers.pragma !== 'no-cache') safeWire = false;
      wire.push({ method: response.request().method(), path: url.pathname, status: response.status() });
      if (url.pathname === '/v2/me/profile' && response.request().method() === 'PATCH')
        profileWire.patch = [200, 400, 401, 403, 409, 500].includes(response.status()) ? String(response.status()) : 'OTHER';
      if (url.pathname === '/v2/me/profile/read' && response.request().method() === 'POST')
        profileWire.read = [200, 400, 401, 403, 409, 500].includes(response.status()) ? String(response.status()) : 'OTHER';
      if (url.pathname === '/v2/auth/enrollment/complete' && response.status() === 201) {
        const body = await response.json();
        if (Object.keys(body).sort().join(',') !== 'csrfToken,sessionId,transport') safeWire = false;
        csrf = body.csrfToken;
      }
      for (const header of await response.headersArray()) {
        if (header.name.toLowerCase() !== 'set-cookie') continue;
        const name = header.value.split('=')[0];
        credentialNames.add(name);
        if (!/;\s*Secure(?:;|$)/i.test(header.value) || !/;\s*HttpOnly(?:;|$)/i.test(header.value) ||
            !/;\s*SameSite=Lax(?:;|$)/i.test(header.value) || /;\s*Domain=/i.test(header.value)) safeWire = false;
      }
    } catch { safeWire = false; }
  });
  await page.addInitScript(selected => globalThis.localStorage.setItem('theme-preference', selected), theme);
  phase = 'NAVIGATE';
  const first = await page.goto(`${origin}/${locale}/register?st237_probe=${randomUUID()}`, { waitUntil: 'domcontentloaded' });
  navigationStatus = first && [200, 304, 400, 404, 500].includes(first.status()) ? String(first.status()) : 'OTHER';
  assert.equal(first?.status(), 200);
  const themeButton = page.getByRole('navigation', { name: preferenceCopy.label, exact: true })
    .getByRole('button', { name: preferenceCopy.themes[theme], exact: true });
  await themeButton.waitFor({ state: 'visible' });
  await page.waitForFunction(({ label, name }) => [...globalThis.document.querySelectorAll('nav[aria-label]')]
    .some(nav => nav.getAttribute('aria-label') === label && [...nav.querySelectorAll('button')]
      .some(button => button.textContent === name && button.getAttribute('aria-pressed') === 'true')),
  { label: preferenceCopy.label, name: preferenceCopy.themes[theme] });
  await themeButton.click();
  await page.waitForFunction(selected => globalThis.localStorage.getItem('theme-preference') === selected, theme);
  phase = 'IDENTIFIER_READY';
  await page.getByRole('heading', { name: copy.registration.title, exact: true }).waitFor();
  await capture('identifier');
  await page.getByLabel(copy.identifier.emailLabel, { exact: true }).fill('private-proof@example.test');
  phase = 'IDENTIFIER_SUBMIT';
  await page.getByRole('button', { name: copy.identifier.continueLabel, exact: true }).click();
  phase = 'OTP';
  await page.getByLabel(copy.registration.otpLabel, { exact: true }).waitFor();
  await capture('otp');
  await page.getByLabel(copy.registration.otpLabel, { exact: true }).fill('123456');
  await page.getByRole('button', { name: copy.registration.verifyLabel, exact: true }).click();
  phase = 'SIMULATOR';
  await page.getByRole('button', { name: copy.registration.simulatorAction, exact: true }).waitFor();
  await capture('simulator');
  await page.getByRole('button', { name: copy.registration.simulatorAction, exact: true }).click();
  phase = 'PROFILE';
  const profileRegion = page.getByRole('region', { name: copy.profile.title, exact: true });
  await profileRegion.getByLabel(copy.profile.displayName, { exact: true }).waitFor();
  await capture('profile');
  phase = 'PROFILE_EDIT';
  await profileRegion.getByLabel(copy.profile.displayName, { exact: true }).fill('Private Proof');
  await profileRegion.getByLabel(copy.profile.language, { exact: true }).selectOption(locale);
  await profileRegion.getByLabel(copy.profile.theme, { exact: true }).selectOption(theme);
  phase = 'PROFILE_SAVE';
  await profileRegion.getByRole('button', { name: copy.profile.save, exact: true }).click();
  await profileRegion.getByText(copy.profile.saved, { exact: true }).waitFor();
  phase = 'PROFILE_SAVED';
  await capture('saved');
  assert.equal(await profileRegion.getByLabel(copy.profile.displayName, { exact: true }).inputValue(), 'Private Proof');
  phase = 'PROFILE_WIRE';
  assert(safeWire);
  const paths = ['/v2/auth/browser-nonce', '/v2/auth/otp/start', '/v2/auth/otp/verify',
    '/v2/auth/enrollment/pending', '/v2/auth/enrollment/simulator/verify', '/v2/auth/enrollment/complete'];
  for (const target of paths) assert.equal(wire.filter(item => item.path === target).length, 1);
  const patchAt = wire.findIndex(item => item.method === 'PATCH' && item.path === '/v2/me/profile' && item.status === 200);
  assert(patchAt > 0);
  assert(wire.slice(patchAt + 1).some(item => item.method === 'POST' && item.path === '/v2/me/profile/read' && item.status === 200));
  phase = 'PROFILE_COOKIES';
  assert(credentialNames.has('st_v2_access') && credentialNames.has('st_v2_refresh') && credentialNames.has('st_v2_chain'));
  const cookies = await context.cookies();
  for (const name of ['st_v2_access', 'st_v2_refresh', 'st_v2_chain']) {
    const cookie = cookies.find(value => value.name === name);
    assert(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.domain === 'localhost');
    assert.equal(cookie.path, name === 'st_v2_refresh' ? '/v2/auth' : '/v2');
  }
  phase = 'AUTHORITY_NEGATIVES';
  negativeCase = 'BROWSER_MATRIX';
  assert.equal(typeof csrf, 'string');
  const statuses = await page.evaluate(async token => {
    const call = async (body, csrfToken) => {
      const response = await globalThis.fetch('/v2/me/profile/read', { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Session-CSRF': csrfToken }, body, cache: 'no-store' });
      return response.status;
    };
    return [await call('{}', `${token.startsWith('A') ? 'B' : 'A'}${token.slice(1)}`),
      await call('{"owner":"foreign"}', token), await call('{"x":1,"x":2}', token), await call('{}', token)];
  }, csrf);
  const browserCases = ['BROWSER_CSRF', 'BROWSER_FOREIGN_BODY', 'BROWSER_DUPLICATE_BODY', 'BROWSER_VALID'];
  for (let index = 0; index < browserCases.length; index++)
    process.stdout.write(`ST237_NEGATIVE_GATE case=${browserCases[index]} status=${safeStatus(statuses[index])} network=NONE\n`);
  assert.deepEqual(statuses, [401, 400, 400, 200]);
  negativeCase = 'COOKIE_ROSTER';
  const cookieHeader = cookies.filter(item => ['st_v2_access', 'st_v2_binding', 'st_v2_chain'].includes(item.name))
    .map(item => `${item.name}=${item.value}`).join('; ');
  const names = Object.fromEntries(cookies.map(item => [item.name, item.value]));
  assert.equal(Object.keys(names).filter(name => name.startsWith('st_v2_')).length, 4);
  const baseHeaders = { Origin: origin, Cookie: cookieHeader, 'X-Session-CSRF': csrf };
  const negativeCases = [
    ['ORIGIN', { ...baseHeaders, Origin: 'https://other.invalid' }, 403, 'PROFILE_REQUEST_REJECTED'],
    ['CHAIN_MISSING', { ...baseHeaders, Cookie: cookieHeader.split('; ').filter(item => !item.startsWith('st_v2_chain=')).join('; ') }, 403, 'PROFILE_REQUEST_REJECTED'],
    ['CHAIN_FOREIGN', { ...baseHeaders, Cookie: cookieHeader.replace(names.st_v2_chain, `${names.st_v2_chain.startsWith('A') ? 'B' : 'A'}${names.st_v2_chain.slice(1)}`) }, 401, 'AUTHENTICATION_REQUIRED'],
    ['CHAIN_DUPLICATE', { ...baseHeaders, Cookie: `${cookieHeader}; st_v2_chain=${names.st_v2_chain}` }, 400, 'INVALID_PROFILE_REQUEST'],
    ['BINDING_MISSING', { ...baseHeaders, Cookie: cookieHeader.split('; ').filter(item => !item.startsWith('st_v2_binding=')).join('; ') }, 403, 'PROFILE_REQUEST_REJECTED'],
    ['BINDING_FOREIGN', { ...baseHeaders, Cookie: cookieHeader.replace(names.st_v2_binding, `${names.st_v2_binding.startsWith('A') ? 'B' : 'A'}${names.st_v2_binding.slice(1)}`) }, 401, 'AUTHENTICATION_REQUIRED'],
    ['REFRESH_EXTRA', { ...baseHeaders, Cookie: `${cookieHeader}; st_v2_refresh=${names.st_v2_refresh}` }, 403, 'PROFILE_REQUEST_REJECTED'],
    ['CSRF_MISSING', { ...baseHeaders, 'X-Session-CSRF': undefined }, 403, 'PROFILE_REQUEST_REJECTED'],  ];
  for (const [caseName, headers, status, code] of negativeCases) {
    const supplied = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
    negativeCase = caseName; negativeStatus = 'NONE'; negativeNetwork = 'NONE';
    const observed = await request(supplied); negativeStatus = safeStatus(observed.status);
    closedProblem(observed, status, code);
  }
  negativeCase = 'WRONG_HOST'; negativeStatus = 'NONE'; negativeNetwork = 'NONE';
  const wrongHost = await request({ ...baseHeaders, Host: 'other.invalid' });
  negativeStatus = safeStatus(wrongHost.status);
  assert.equal(wrongHost.status, 421);
  assert.equal(wrongHost.headers['cache-control'], 'no-store');
  assert.equal(wrongHost.headers.pragma, 'no-cache');
  negativeCase = 'NATIVE_DUPLICATE_BODY'; negativeStatus = 'NONE';
  const malformed = await request(baseHeaders, '{"x":1,"x":2}'); negativeStatus = safeStatus(malformed.status);
  closedProblem(malformed, 400, 'INVALID_PROFILE_REQUEST');
  negativeCase = 'STORAGE'; negativeStatus = 'NONE';
  const visibleCookie = await page.evaluate(() => globalThis.document.cookie);
  assert(!visibleCookie.includes('st_v2_'));
  const storage = await page.evaluate(() => ({ local: Object.keys(globalThis.localStorage), session: Object.keys(globalThis.sessionStorage) }));
  assert(storage.local.every(key => /theme|locale/i.test(key)) && storage.session.length === 0);
  phase = 'RESTART';
  fs.writeFileSync(path.join(handshake, 'ready'), '', { flag: 'wx', mode: 0o600 });
  await awaitMarker('resume');
  const restored = await request(baseHeaders);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.displayName, 'Private Proof');
  assert.equal(restored.body.profileComplete, true);
  process.stdout.write('PASS ST237_BROWSER_SAME_KEY_FRESH_PROCESS_RESTART\n');
  phase = 'LOST_RESPONSE';
  let committedPatchCount = 0;
  await page.route('**/v2/me/profile', async route => {
    if (route.request().method() !== 'PATCH') { await route.continue(); return; }
    committedPatchCount++;
    const committed = await route.fetch();
    assert.equal(committed.status(), 200);
    await route.abort('failed');
  });
  await profileRegion.getByLabel(copy.profile.displayName, { exact: true }).fill('Private Proof Updated');
  await profileRegion.getByRole('button', { name: copy.profile.save, exact: true }).dblclick();
  await profileRegion.getByText(copy.profile.uncertain, { exact: true }).waitFor();
  assert.equal(committedPatchCount, 1);
  const afterLostResponse = await request(baseHeaders);
  assert.equal(afterLostResponse.status, 200);
  assert.equal(afterLostResponse.body.displayName, 'Private Proof Updated');
  process.stdout.write('PASS ST237_BROWSER_COMMITTED_PATCH_LOST_RESPONSE_SINGLE_SUBMISSION\n');
  csrf = '';
  phase = 'RELOAD';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText(copy.registration.verifiedLoginRequired, { exact: true }).waitFor();
  assert.equal(await profileRegion.getByLabel(copy.profile.displayName, { exact: true }).count(), 0);
  await capture('reload-stop');
  phase = 'PARTIAL_TERMINAL';
  await context.clearCookies();
  const partialPage = await context.newPage();
  partialPage.setDefaultTimeout(45000);
  let completionRequests = 0;
  let committedCompletion = false;
  partialPage.on('request', incoming => {
    if (new URL(incoming.url()).pathname === '/v2/auth/enrollment/complete') completionRequests++;
  });
  await partialPage.route('**/v2/auth/enrollment/complete', async route => {
    const committed = await route.fetch();
    assert.equal(committed.status(), 201);
    committedCompletion = true;
    const setCookies = (await committed.headersArray()).filter(header => header.name.toLowerCase() === 'set-cookie');
    assert.deepEqual(setCookies.map(header => header.value.split('=')[0]).sort(),
      ['st_v2_access', 'st_v2_chain', 'st_v2_refresh']);
    const accessOnly = setCookies.find(header => header.value.startsWith('st_v2_access='));
    assert(accessOnly);
    // route.fetch may populate the shared browser cookie jar before fulfill. Remove only
    // terminal credentials, then deliver the one retained header to model partial storage.
    for (const name of ['st_v2_access', 'st_v2_refresh', 'st_v2_chain']) await context.clearCookies({ name });
    await route.fulfill({ response: committed, headers: { ...committed.headers(), 'set-cookie': accessOnly.value } });
  });
  const partialStart = await partialPage.goto(`${origin}/${locale}/register?st237_probe=${randomUUID()}`,
    { waitUntil: 'domcontentloaded' });
  assert.equal(partialStart?.status(), 200);
  await partialPage.getByLabel(copy.identifier.emailLabel, { exact: true }).fill(`partial-${randomUUID()}@example.test`);
  await partialPage.getByRole('button', { name: copy.identifier.continueLabel, exact: true }).click();
  await partialPage.getByLabel(copy.registration.otpLabel, { exact: true }).fill('123456');
  await partialPage.getByRole('button', { name: copy.registration.verifyLabel, exact: true }).click();
  await partialPage.getByRole('button', { name: copy.registration.simulatorAction, exact: true }).waitFor();
  const deniedRead = partialPage.waitForResponse(response =>
    new URL(response.url()).pathname === '/v2/me/profile/read' && response.request().method() === 'POST');
  await partialPage.getByRole('button', { name: copy.registration.simulatorAction, exact: true }).click();
  const denied = await deniedRead;
  assert(committedCompletion);
  assert.equal(completionRequests, 1);
  assert.equal(denied.status(), 403);
  const deniedBody = await denied.json();
  assert.deepEqual(Object.keys(deniedBody).sort(), ['code', 'status', 'title', 'type']);
  assert.equal(deniedBody.code, 'PROFILE_REQUEST_REJECTED');
  await partialPage.getByText(copy.registration.verifiedLoginRequired, { exact: true }).waitFor();
  assert.equal(await partialPage.getByRole('region', { name: copy.profile.title, exact: true })
    .getByLabel(copy.profile.displayName, { exact: true }).count(), 0);
  const retained = await context.cookies();
  assert(retained.some(cookie => cookie.name === 'st_v2_access'));
  assert(retained.some(cookie => cookie.name === 'st_v2_binding'));
  assert(!retained.some(cookie => cookie.name === 'st_v2_chain' || cookie.name === 'st_v2_refresh'));
  assert.equal(completionRequests, 1);
  await partialPage.close();
  process.stdout.write(`PASS ST237_BROWSER_ENROLLMENT_PROFILE locale=${locale} theme=${theme}\n`);
  process.stdout.write('PASS ST237_BROWSER_CURRENT_AUTHORITY_NEGATIVES\nPASS ST237_BROWSER_RELOAD_STOP\n');
  process.stdout.write('PASS ST237_BROWSER_COMMITTED_PARTIAL_TERMINAL_COOKIE_STOP\n');
} catch {
  if (phase === 'AUTHORITY_NEGATIVES') process.stderr.write(`ST237_NEGATIVE_GATE case=${negativeCase} status=${negativeStatus} network=${negativeNetwork}\n`);
  process.stderr.write(`FAIL ST237_BROWSER_PROFILE phase=${phase} navigation=${navigationStatus} patch=${profileWire.patch} read=${profileWire.read}\n`);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
}
