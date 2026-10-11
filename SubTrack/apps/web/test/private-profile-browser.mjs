// Actual natural browser driver; no credential bodies, console messages or traces leave task custody.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
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
const browserCase = process.env.ST237_BROWSER_CASE;
assert(['sv', 'en'].includes(locale));
assert(['light', 'dark'].includes(theme));
assert(['profile', 'partial-terminal', 'subscriptions', 'empty', 'uncertainty', 'login'].includes(browserCase));
assert(require('playwright/package.json').version === '1.63.0');
const catalog = JSON.parse(fs.readFileSync(path.join(webDir, '../../packages/i18n/catalogs', `${locale}.json`), 'utf8'));
const copy = catalog.onboarding;
const preferenceCopy = catalog.preferences;
const handshake = process.env.ST237_HANDSHAKE_DIR;
assert(handshake && fs.statSync(handshake).isDirectory());
const ca = fs.readFileSync(path.join(handshake, 'ca.crt'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function reloadFailureClass(value) {
  const name = typeof value?.name === 'string' ? value.name : '';
  const message = typeof value === 'string' ? value : typeof value?.message === 'string' ? value.message : '';
  if (name === 'TimeoutError' || /\btimed?\s*out\b|\btimeout\b/i.test(message)) return 'TIMEOUT';
  if (/\bTLS\b|\bSSL\b|\bCERT(?:IFICATE)?\b|SEC_ERROR_/i.test(message)) return 'TLS';
  if (/ECONN|ENOTFOUND|EAI_AGAIN|NS_ERROR_NET|ERR_(?:CONNECTION|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/i.test(message)) return 'CONNECTION';
  if (/\bABORT(?:ED)?\b|\bCANCEL(?:LED|ED)?\b|NS_BINDING_ABORTED|ERR_ABORTED/i.test(message)) return 'ABORT';
  return 'OTHER';
}
async function awaitMarker(name) {
  for (let i = 0; i < 600; i++) { if (fs.existsSync(path.join(handshake, name))) return; await delay(100); }
  throw new Error('handshake');
}
function request(headers, body = '{}', pathname = '/v2/me/profile/read', wrongHostProbe = false, method = 'POST') {
  if (wrongHostProbe) assert(headers.Host === 'other.invalid' && body === '{}' && pathname === '/v2/me/profile/read');
  return new Promise((resolve, reject) => {
    const req = https.request(`${origin}${pathname}`, { method, family: 4, ca,
      // Deliberate HTTP Host denial still verifies TLS against the actual localhost destination.
      ...(wrongHostProbe ? { servername: 'localhost' } : {}), headers: {
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
let page;
let screenshotDir;
let profileWire = { patch: 'NONE', read: 'NONE' };
let navigationStatus = 'NONE';
let reloadNavigationType = 'NONE';
let reloadStatus = 'NONE';
let reloadError = 'NONE', reloadPageClosed = 'NONE', reloadRequestFailure = 'NONE';
let partialNavigation = 'NONE', partialCompletion = 'NONE', partialRead = 'NONE';
let partialCompletionCount = 'ZERO', partialRoute = 'NONE';
let negativeCase = 'NONE', negativeStatus = 'NONE', negativeNetwork = 'NONE';
const safeStatus = value => [200, 400, 401, 403, 409, 421, 500].includes(value) ? String(value) : 'OTHER';
try {
  context = await firefox.launchPersistentContext(process.env.ST237_TRUSTED_PROFILE,
    { headless: true, locale: locale === 'sv' ? 'sv-SE' : 'en-GB' });
  screenshotDir = path.resolve(process.env.ST237_SCREENSHOT_DIR);
  fs.mkdirSync(screenshotDir, { mode: 0o700 });
  if (browserCase === 'profile' || browserCase === 'subscriptions' || browserCase === 'empty' || browserCase === 'uncertainty' || browserCase === 'login') {
  page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('requestfailed', request => {
    if (phase !== 'RELOAD_NAVIGATE' || !request.isNavigationRequest() || request.resourceType() !== 'document') return;
    try {
      if (request.frame() !== page.mainFrame()) return;
      reloadRequestFailure = reloadFailureClass(request.failure()?.errorText);
    } catch { reloadRequestFailure = 'OTHER'; }
  });
  const capture = async step => { await page.screenshot({ path: path.join(screenshotDir, `${step}.png`), fullPage: true }); };
  const wire = [];
  let aliceReturnStart = 0;
  const credentialNames = new Set();
  let csrf = '';
  let safeWire = true;
  const pendingWireChecks = new Set();
  const checkPrivateHeaders = async (response, pathname) => {
    const headers = typeof response.allHeaders === 'function' ? await response.allHeaders() : response.headers();
    if (headers['cache-control'] !== 'no-store' || headers.pragma !== 'no-cache') safeWire = false;
    const responseHeaders = await response.headersArray();
    if (pathname === '/v2/auth/login/simulator/verify' && responseHeaders.some(header =>
      header.name.toLowerCase() === 'set-cookie')) safeWire = false;
    for (const header of responseHeaders) {
      if (header.name.toLowerCase() !== 'set-cookie') continue;
      const name = header.value.split('=')[0];
      credentialNames.add(name);
      if (!/;\s*Secure(?:;|$)/i.test(header.value) || !/;\s*HttpOnly(?:;|$)/i.test(header.value) ||
          !/;\s*SameSite=Lax(?:;|$)/i.test(header.value) || /;\s*Domain=/i.test(header.value)) safeWire = false;
    }
  };
  // Keep the one volatile CSRF only in this private driver, never a receipt or storage artifact.
  const observePrivateResponse = async response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/v2/')) return;
    try {
      await checkPrivateHeaders(response, url.pathname);
      wire.push({ method: response.request().method(), path: url.pathname, status: response.status() });
      if (url.pathname === '/v2/me/profile' && response.request().method() === 'PATCH')
        profileWire.patch = [200, 400, 401, 403, 409, 500].includes(response.status()) ? String(response.status()) : 'OTHER';
      if (url.pathname === '/v2/me/profile/read' && response.request().method() === 'POST')
        profileWire.read = [200, 400, 401, 403, 409, 500].includes(response.status()) ? String(response.status()) : 'OTHER';
      if ((url.pathname === '/v2/auth/enrollment/complete' || url.pathname === '/v2/auth/session') &&
          response.status() === 201) {
        const body = await response.json();
        if (Object.keys(body).sort().join(',') !== 'csrfToken,sessionId,transport') safeWire = false;
        csrf = body.csrfToken;
      }
    } catch { safeWire = false; }
  };
  const attachWireObserver = target => target.on('response', response => {
    const check = observePrivateResponse(response);
    pendingWireChecks.add(check);
    void check.finally(() => pendingWireChecks.delete(check));
  });
  const assertSafeWire = async () => { await Promise.all([...pendingWireChecks]); assert(safeWire); };
  attachWireObserver(page);
  await page.addInitScript(selected => globalThis.localStorage.setItem('theme-preference', selected), theme);
  phase = 'NAVIGATE';
  const first = await page.goto(`${origin}/${locale}/register?st237_probe=${randomUUID()}`, { waitUntil: 'domcontentloaded' });
  navigationStatus = first && [200, 304, 400, 404, 500].includes(first.status()) ? String(first.status()) : 'OTHER';
  assert.equal(first?.status(), 200);
  const awaitPreferenceInteraction = async () => {
    const themeButton = page.getByRole('navigation', { name: preferenceCopy.label, exact: true })
      .getByRole('button', { name: preferenceCopy.themes[theme], exact: true });
    await themeButton.waitFor({ state: 'visible' });
    await page.waitForFunction(({ label, name }) => [...globalThis.document.querySelectorAll('nav[aria-label]')]
      .some(nav => nav.getAttribute('aria-label') === label && [...nav.querySelectorAll('button')]
        .some(button => button.textContent === name && button.getAttribute('aria-pressed') === 'true')),
    { label: preferenceCopy.label, name: preferenceCopy.themes[theme] });
    await themeButton.click();
    await page.waitForFunction(selected => globalThis.localStorage.getItem('theme-preference') === selected, theme);
  };
  await awaitPreferenceInteraction();
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
  if (browserCase === 'subscriptions') {
    phase = 'SUBSCRIPTION_INCOMPLETE';
    for (let i = 0; i < 50 && !csrf; i++) await delay(100);
    assert(csrf);
    const cookies = await context.cookies();
    const cookieHeader = cookies.filter(item => ['st_v2_access', 'st_v2_binding', 'st_v2_chain'].includes(item.name))
      .map(item => `${item.name}=${item.value}`).join('; ');
    const headers = { Origin: origin, Cookie: cookieHeader, 'X-Session-CSRF': csrf };
    closedProblem(await request(headers, '{"mode":"just-me"}', '/v2/me/mode'), 409, 'MODE_CONFLICT');
    closedProblem(await request(headers, '{}', '/v2/subscriptions/owner/read'), 409, 'MODE_CONFLICT');
    process.stdout.write('PASS ST238_BROWSER_NATURAL_INCOMPLETE_CHOICE_AND_LIST_DENIED\n');
  }
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
  if (browserCase === 'empty') {
    phase = 'EMPTY_LIST';
    await page.getByRole('button', { name: copy.mode.choose, exact: true }).click();
    const emptyRegion = page.getByRole('region', { name: copy.ownerSubscriptions.title, exact: true });
    await emptyRegion.getByText(copy.ownerSubscriptions.empty, { exact: true }).waitFor();
    assert.equal(await emptyRegion.getByRole('listitem').count(), 0);
    assert.equal(await emptyRegion.getByRole('button', { name: copy.ownerSubscriptions.loadMore, exact: true }).count(), 0);
    assert.equal(wire.filter(x => x.method === 'POST' && x.path === '/v2/me/mode' && x.status === 200).length, 1);
    assert.equal(wire.filter(x => x.method === 'POST' && x.path === '/v2/me/mode/read' && x.status === 200).length, 1);
    assert.equal(wire.filter(x => x.method === 'POST' && x.path === '/v2/subscriptions/owner/read' && x.status === 200).length, 1);
    await capture('owner-empty');
    process.stdout.write('PASS ST238_BROWSER_NATURAL_OWNER_PERSISTED_EMPTY_LIST\n');
    process.stdout.write(`PASS ST237_BROWSER_CASE case=empty locale=${locale} theme=${theme}\n`);
  } else if (browserCase === 'subscriptions' || browserCase === 'uncertainty' || browserCase === 'login') {
    phase = 'SUBSCRIPTION_SEED_BARRIER';
    fs.writeFileSync(path.join(handshake, 'subscription-seed-ready'), '', { flag: 'wx', mode: 0o600 });
    await awaitMarker('subscription-seeded');
    phase = 'MODE_CHOICE';
    let modeWrites = 0;
    if (browserCase === 'uncertainty') await page.route('**/v2/me/mode', async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      modeWrites++;
      const committed = await route.fetch();
      assert.equal(committed.status(), 200);
      await route.abort('failed');
    });
    await page.getByRole('button', { name: copy.mode.choose, exact: true }).click();
    if (browserCase === 'login') {
      phase = 'LOGIN_PRIOR_LIST';
      await page.getByRole('heading', { name: copy.ownerSubscriptions.title, exact: true }).waitFor();
      assert.equal(await page.getByRole('region', { name: copy.ownerSubscriptions.title, exact: true }).getByRole('listitem').count(), 50);
      const oldSession = (await context.cookies()).find(cookie => cookie.name === 'st_v2_access')?.value;
      assert(oldSession);
      const currentHeaders = async () => ({ Origin: origin, 'X-Session-CSRF': csrf,
        Cookie: (await context.cookies()).filter(item => ['st_v2_access', 'st_v2_binding', 'st_v2_chain'].includes(item.name))
          .map(item => `${item.name}=${item.value}`).join('; ') });
      const aliceProfileBefore = await request(await currentHeaders());
      assert.equal(aliceProfileBefore.status, 200);
      assert.deepEqual(aliceProfileBefore.body, { displayName: 'Private Proof', avatarColourToken: null,
        avatarEmoji: null, language: locale, theme, defaultCurrency: 'SEK', profileComplete: true });
      const aliceModeBefore = await request(await currentHeaders(), '{}', '/v2/me/mode/read');
      assert.deepEqual(aliceModeBefore.body, { mode: 'just-me' });
      const openFreshPage = async () => {
        page = await context.newPage();
        page.setDefaultTimeout(45000);
        await page.addInitScript(selected => globalThis.localStorage.setItem('theme-preference', selected), theme);
        attachWireObserver(page);
      };
      const startFreshLogin = async (identity, prefix) => {
        phase = `${prefix}_BOOTSTRAP`;
        await page.goto(`${origin}/${locale}`, { waitUntil: 'domcontentloaded' });
        await awaitPreferenceInteraction();
        phase = `${prefix}_LINK`;
        await page.getByRole('link', { name: copy.welcome.logIn, exact: true }).click();
        await page.getByRole('heading', { name: copy.login.title, exact: true }).waitFor();
        phase = `${prefix}_FIXTURE`;
        await page.getByLabel(copy.login.fixtureLabel, { exact: true }).selectOption(identity);
        const profileRead = page.waitForResponse(response => new URL(response.url()).pathname === '/v2/me/profile/read' &&
          response.request().method() === 'POST' && response.status() === 200)
          .then(response => ({ response }), error => ({ error }));
        const modeRead = page.waitForResponse(response => new URL(response.url()).pathname === '/v2/me/mode/read' &&
          response.request().method() === 'POST' && response.status() === 200)
          .then(response => ({ response }), error => ({ error }));
        phase = `${prefix}_SUBMIT`;
        await page.getByRole('button', { name: copy.login.simulatorAction, exact: true }).click();
        phase = `${prefix}_PROFILE_RESPONSE`;
        const profileResult = await profileRead;
        if ('error' in profileResult) throw profileResult.error;
        phase = `${prefix}_MODE_RESPONSE`;
        const modeResult = await modeRead;
        if ('error' in modeResult) throw modeResult.error;
        return { profile: await profileResult.response.json(), mode: await modeResult.response.json() };
      };
      phase = 'ALICE_EXISTING_SUBJECT_ENROLLMENT_STOP';
      await context.clearCookies();
      csrf = '';
      await page.close();
      await openFreshPage();
      await page.goto(`${origin}/${locale}/register?st239_probe=${randomUUID()}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: copy.registration.title, exact: true }).waitFor();
      await capture('registered-subject-identifier');
      await page.getByLabel(copy.identifier.emailLabel, { exact: true }).fill(`returning-${randomUUID()}@example.test`);
      await page.getByRole('button', { name: copy.identifier.continueLabel, exact: true }).click();
      await page.getByLabel(copy.registration.otpLabel, { exact: true }).fill('123456');
      await page.getByRole('button', { name: copy.registration.verifyLabel, exact: true }).click();
      await page.getByRole('button', { name: copy.registration.simulatorAction, exact: true }).waitFor();
      const loginRequiredResponse = page.waitForResponse(response =>
        new URL(response.url()).pathname === '/v2/auth/enrollment/complete' && response.status() === 409);
      await page.getByRole('button', { name: copy.registration.simulatorAction, exact: true }).click();
      const loginRequired = await loginRequiredResponse;
      assert.deepEqual(await loginRequired.json(), { type: 'about:blank', title: 'Authentication unavailable',
        status: 409, code: 'ENROLLMENT_LOGIN_REQUIRED' });
      await page.getByText(copy.registration.verifiedLoginRequired, { exact: true }).waitFor();
      await capture('registered-subject-login-required');
      const alternateLogin = page.getByRole('link', { name: copy.login.freshLogin, exact: true });
      await alternateLogin.click();
      await page.getByRole('heading', { name: copy.login.title, exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, `/${locale}/login`);
      await capture('registered-subject-login-entry');
      phase = 'BOB_ENROLL_NAVIGATE';
      await page.goto(`${origin}/${locale}/register?st239_probe=${randomUUID()}`, { waitUntil: 'domcontentloaded' });
      phase = 'BOB_ENROLL_READY';
      await awaitPreferenceInteraction();
      phase = 'BOB_IDENTIFIER_FILL';
      await page.getByLabel(copy.identifier.emailLabel, { exact: true }).fill(`second-owner-${randomUUID()}@example.test`);
      phase = 'BOB_IDENTIFIER_SUBMIT';
      await page.getByRole('button', { name: copy.identifier.continueLabel, exact: true }).click();
      phase = 'BOB_OTP_FILL';
      await page.getByLabel(copy.registration.otpLabel, { exact: true }).fill('123456');
      phase = 'BOB_OTP_SUBMIT';
      await page.getByRole('button', { name: copy.registration.verifyLabel, exact: true }).click();
      phase = 'BOB_FIXTURE_SELECT';
      await page.getByLabel(copy.login.fixtureLabel, { exact: true }).selectOption('bob');
      phase = 'BOB_SIMULATOR_CLICK';
      await page.getByRole('button', { name: copy.registration.simulatorAction, exact: true }).click();
      const bobEditor = page.getByRole('region', { name: copy.profile.title, exact: true });
      phase = 'BOB_EDITOR_WAIT';
      await bobEditor.getByLabel(copy.profile.displayName, { exact: true }).waitFor();
      phase = 'BOB_CSRF_WAIT';
      for (let i = 0; i < 50 && !csrf; i++) await delay(100);
      assert(csrf);
      phase = 'BOB_PROFILE_FETCH';
      const bobProfileBefore = await request(await currentHeaders());
      phase = 'BOB_PROFILE_ASSERT';
      assert.equal(bobProfileBefore.status, 200);
      assert.deepEqual(bobProfileBefore.body, { displayName: null, avatarColourToken: null,
        avatarEmoji: null, language: locale, theme: 'system', defaultCurrency: 'SEK', profileComplete: false });
      phase = 'BOB_MODE_FETCH';
      const bobModeBefore = await request(await currentHeaders(), '{}', '/v2/me/mode/read');
      phase = 'BOB_MODE_ASSERT';
      assert.equal(bobModeBefore.status, 200);
      assert.deepEqual(bobModeBefore.body, { mode: null });
      phase = 'CONTACT_SNAPSHOT_BARRIER';
      fs.writeFileSync(path.join(handshake, 'CONTACT_SNAPSHOT_READY'), '', { flag: 'wx', mode: 0o600 });
      await awaitMarker('CONTACT_SNAPSHOT_CAPTURED');
      await page.close();
      await openFreshPage();
      phase = 'BOB_INCOMPLETE_LOGIN';
      let loginWireStart = wire.length;
      const bobIncompleteRead = await startFreshLogin('bob', 'BOB_INCOMPLETE_LOGIN');
      phase = 'BOB_INCOMPLETE_BODY';
      assert.deepEqual(bobIncompleteRead, { profile: bobProfileBefore.body, mode: bobModeBefore.body });
      phase = 'BOB_INCOMPLETE_EDITOR';
      await page.getByRole('region', { name: copy.profile.title, exact: true }).getByLabel(copy.profile.displayName, { exact: true }).waitFor();
      assert.equal(await page.getByRole('region', { name: copy.profile.title, exact: true })
        .getByLabel(copy.profile.displayName, { exact: true }).inputValue(), '');
      assert.equal(await page.getByRole('region', { name: copy.ownerSubscriptions.title, exact: true }).count(), 0);
      phase = 'BOB_INCOMPLETE_WIRE';
      await Promise.all([...pendingWireChecks]);
      assert.deepEqual(wire.slice(loginWireStart).filter(item => item.path === '/v2/me/profile/read' ||
        item.path === '/v2/me/mode/read' || item.path === '/v2/subscriptions/owner/read').map(item => item.path),
      ['/v2/me/profile/read', '/v2/me/mode/read']);
      assert.equal(wire.slice(loginWireStart).filter(item => item.path === '/v2/me/profile' || item.path === '/v2/me/mode').length, 0);
      phase = 'BOB_INCOMPLETE_CAPTURE';
      await capture('login-incomplete-profile');
      phase = 'BOB_INCOMPLETE_SAVE';
      const resumedBobEditor = page.getByRole('region', { name: copy.profile.title, exact: true });
      await resumedBobEditor.getByLabel(copy.profile.displayName, { exact: true }).fill('Second Owner');
      await resumedBobEditor.getByRole('button', { name: copy.profile.save, exact: true }).click();
      await resumedBobEditor.getByText(copy.profile.saved, { exact: true }).waitFor();
      const bobProfileSaved = await request(await currentHeaders());
      assert.equal(bobProfileSaved.status, 200);
      assert.deepEqual(bobProfileSaved.body, { ...bobProfileBefore.body, displayName: 'Second Owner', profileComplete: true });
      await page.close();
      await openFreshPage();
      phase = 'BOB_ABSENT_MODE_LOGIN';
      loginWireStart = wire.length;
      const bobModeRead = await startFreshLogin('bob', 'BOB_ABSENT_MODE_LOGIN');
      phase = 'BOB_ABSENT_MODE_BODY';
      assert.deepEqual(bobModeRead, { profile: bobProfileSaved.body, mode: bobModeBefore.body });
      phase = 'BOB_ABSENT_MODE_EDITOR';
      await page.getByRole('button', { name: copy.mode.choose, exact: true }).waitFor();
      assert.equal(await page.getByRole('region', { name: copy.ownerSubscriptions.title, exact: true }).count(), 0);
      phase = 'BOB_ABSENT_MODE_WIRE';
      await Promise.all([...pendingWireChecks]);
      assert.deepEqual(wire.slice(loginWireStart).filter(item => item.path === '/v2/me/profile/read' ||
        item.path === '/v2/me/mode/read' || item.path === '/v2/subscriptions/owner/read').map(item => item.path),
      ['/v2/me/profile/read', '/v2/me/mode/read']);
      assert.equal(wire.slice(loginWireStart).filter(item => item.path === '/v2/me/profile' || item.path === '/v2/me/mode').length, 0);
      await capture('login-absent-mode');
      await page.getByRole('button', { name: copy.mode.choose, exact: true }).click();
      const bobEmpty = page.getByRole('region', { name: copy.ownerSubscriptions.title, exact: true });
      await bobEmpty.getByText(copy.ownerSubscriptions.empty, { exact: true }).waitFor();
      assert.equal(await bobEmpty.getByRole('listitem').count(), 0);
      const bobModeAfterChoice = await request(await currentHeaders(), '{}', '/v2/me/mode/read');
      assert.equal(bobModeAfterChoice.status, 200);
      assert.deepEqual(bobModeAfterChoice.body, { mode: 'just-me' });
      await capture('login-second-owner-empty');
      await page.close();
      await openFreshPage();
      aliceReturnStart = wire.length;
      phase = 'LOGIN_WELCOME';
      await page.goto(`${origin}/${locale}`, { waitUntil: 'domcontentloaded' });
      await capture('login-welcome');
      await page.getByRole('link', { name: copy.welcome.logIn, exact: true }).click();
      await page.getByRole('heading', { name: copy.login.title, exact: true }).waitFor();
      await capture('login-choice');
      let observedAliceProfile = null;
      let observedAliceMode = null;
      const progressRoutes = [
        ['**/v2/auth/login/simulator/verify', copy.login.verifying, 'login-verifying'],
        ['**/v2/auth/session', copy.login.creatingSession, 'login-session-progress'],
        ['**/v2/me/profile/read', copy.profileLoading, 'login-profile-loading'],
        ['**/v2/me/mode/read', copy.login.loadingMode, 'login-profile-read-mode-loading'],
        ['**/v2/subscriptions/owner/read', copy.ownerSubscriptions.loading, 'login-mode-read-list-loading'],
      ];
      const progressHandlers = [];
      for (const [routePattern, statusText, screenshot] of progressRoutes) {
        const handler = async route => {
          await page.getByRole('status').getByText(statusText, { exact: true }).waitFor();
          await capture(screenshot);
          if (routePattern.includes('login/simulator/verify')) {
            const verified = await route.fetch();
            assert.equal(verified.status(), 200);
            await checkPrivateHeaders(verified, '/v2/auth/login/simulator/verify');
            assert.equal((await verified.headersArray()).filter(header => header.name.toLowerCase() === 'set-cookie').length, 0);
            await route.fulfill({ response: verified });
          } else if (routePattern.includes('/profile/read')) {
            const read = await route.fetch();
            assert.equal(read.status(), 200);
            observedAliceProfile = await read.json();
            assert.deepEqual(observedAliceProfile, aliceProfileBefore.body);
            await route.fulfill({ response: read });
          } else if (routePattern.includes('/mode/read')) {
            assert.deepEqual(observedAliceProfile, aliceProfileBefore.body);
            const read = await route.fetch();
            assert.equal(read.status(), 200);
            observedAliceMode = await read.json();
            assert.deepEqual(observedAliceMode, aliceModeBefore.body);
            await route.fulfill({ response: read });
          } else {
            assert.deepEqual(observedAliceMode, aliceModeBefore.body);
            await route.continue();
          }
        };
        await page.route(routePattern, handler);
        progressHandlers.push([routePattern, handler]);
      }
      phase = 'LOGIN_VERIFY';
      await page.getByRole('button', { name: copy.login.simulatorAction, exact: true }).click();
      await page.getByRole('heading', { name: copy.ownerSubscriptions.title, exact: true }).waitFor();
      for (const [routePattern, handler] of progressHandlers) await page.unroute(routePattern, handler);
      const loginStart = wire.findIndex((item, index) => index >= aliceReturnStart && item.path === '/v2/auth/login/simulator/verify' && item.status === 200);
      assert(loginStart > 0);
      const sessionAt = wire.findIndex((item, index) => index > loginStart && item.path === '/v2/auth/session' && item.status === 201);
      const profileAt = wire.findIndex((item, index) => index > sessionAt && item.path === '/v2/me/profile/read' && item.status === 200);
      const modeAt = wire.findIndex((item, index) => index > profileAt && item.path === '/v2/me/mode/read' && item.status === 200);
      const listAt = wire.findIndex((item, index) => index > modeAt && item.path === '/v2/subscriptions/owner/read' && item.status === 200);
      assert(sessionAt > loginStart && profileAt > sessionAt && modeAt > profileAt && listAt > modeAt);
      assert.deepEqual(observedAliceProfile, aliceProfileBefore.body);
      assert.deepEqual(observedAliceMode, aliceModeBefore.body);
      const aliceProfileAfter = await request(await currentHeaders());
      const aliceModeAfter = await request(await currentHeaders(), '{}', '/v2/me/mode/read');
      assert.equal(aliceProfileAfter.status, 200);
      assert.equal(aliceModeAfter.status, 200);
      assert.deepEqual(aliceProfileAfter.body, aliceProfileBefore.body);
      assert.deepEqual(aliceModeAfter.body, aliceModeBefore.body);
      assert.equal(wire.filter((item, index) => index > loginStart &&
        (item.path === '/v2/me/profile' || item.path === '/v2/me/mode')).length, 0);
      const newSession = (await context.cookies()).find(cookie => cookie.name === 'st_v2_access')?.value;
      assert(newSession && newSession !== oldSession);
      await capture('login-returned-list');
    }
    if (browserCase === 'uncertainty') {
      await page.getByRole('heading', { name: copy.ownerSubscriptions.title, exact: true }).waitFor();
      assert.equal(modeWrites, 1);
      assert.equal(wire.filter(x => x.method === 'POST' && x.path === '/v2/me/mode/read' && x.status === 200).length, 1);
      await page.unroute('**/v2/me/mode');
    }
    phase = 'SUBSCRIPTION_LIST';
    await page.getByRole('heading', { name: copy.ownerSubscriptions.title, exact: true }).waitFor();
    const ownerRegion = page.getByRole('region', { name: copy.ownerSubscriptions.title, exact: true });
    assert.equal(await ownerRegion.getByRole('listitem').count(), 50);
    await capture('owner-list-first-page');
    await page.getByRole('button', { name: copy.ownerSubscriptions.loadMore, exact: true }).click();
    await page.waitForFunction(() => globalThis.document.querySelectorAll('li button[aria-label]').length === 51);
    assert.equal(await page.getByRole('button', { name: copy.ownerSubscriptions.loadMore, exact: true }).count(), 0);
    await capture('owner-list-loaded');
    const firstRow = ownerRegion.getByRole('listitem').first().getByRole('button');
    await firstRow.focus();
    await page.keyboard.press('Tab');
    const secondRow = ownerRegion.getByRole('listitem').nth(1).getByRole('button');
    assert.equal(await secondRow.evaluate(element => globalThis.document.activeElement === element), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await firstRow.evaluate(element => globalThis.document.activeElement === element), true);
    assert.equal(await firstRow.evaluate(element => element.matches(':focus-visible')), true);
    await capture('focused-owner-row');
    await firstRow.press('Enter');
    phase = 'SUBSCRIPTION_DETAIL';
    await page.getByRole('heading', { name: copy.ownerSubscriptions.detail, exact: true }).waitFor();
    await capture('subscription-detail');
    let statusWrites = 0;
    let selectedId = '';
    if (browserCase === 'uncertainty') await page.route('**/v2/subscriptions/*', async route => {
      if (route.request().method() !== 'PATCH') { await route.continue(); return; }
      statusWrites++;
      selectedId = new URL(route.request().url()).pathname.split('/').at(-1);
      const committed = await route.fetch();
      assert.equal(committed.status(), 200);
      await route.abort('failed');
    });
    await page.getByRole('button', { name: copy.ownerSubscriptions.actions.PAUSED, exact: true }).click();
    phase = 'SUBSCRIPTION_STATUS';
    if (browserCase === 'uncertainty') {
      await page.getByText(copy.ownerSubscriptions.rechecked, { exact: true }).waitFor();
      assert.equal(statusWrites, 1);
      assert.equal(await page.getByText(copy.ownerSubscriptions.confirmed, { exact: true }).count(), 0);
      assert(wire.some(x => x.method === 'POST' && x.path === `/v2/subscriptions/${selectedId}/read` && x.status === 200));
      await page.unroute('**/v2/subscriptions/*');
      phase = 'SUBSCRIPTION_RESTART';
      fs.writeFileSync(path.join(handshake, 'ready'), '', { flag: 'wx', mode: 0o600 });
      await awaitMarker('resume');
      const cookies = await context.cookies();
      const cookieHeader = cookies.filter(item => ['st_v2_access', 'st_v2_binding', 'st_v2_chain'].includes(item.name))
        .map(item => `${item.name}=${item.value}`).join('; ');
      const headers = { Origin: origin, Cookie: cookieHeader, 'X-Session-CSRF': csrf };
      const mode = await request(headers, '{}', '/v2/me/mode/read');
      assert.equal(mode.status, 200);
      assert.deepEqual(mode.body, { mode: 'just-me' });
      const pageAfterRestart = await request(headers, '{}', '/v2/subscriptions/owner/read');
      assert.equal(pageAfterRestart.status, 200);
      assert.equal(pageAfterRestart.body.items.length, 50);
      assert.equal(typeof pageAfterRestart.body.nextCursor, 'string');
      const detail = await request(headers, '{}', `/v2/subscriptions/${selectedId}/read`);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.status, 'PAUSED');
      await assertSafeWire();
      await capture('uncertain-status');
      process.stdout.write('PASS ST238_BROWSER_NATURAL_COMMITTED_MODE_STATUS_LOST_RESPONSE_NO_RETRY_RESTART\n');
      process.stdout.write(`PASS ST237_BROWSER_CASE case=uncertainty locale=${locale} theme=${theme}\n`);
    } else await page.getByText(copy.ownerSubscriptions.confirmed, { exact: true }).waitFor();
    if (browserCase === 'subscriptions' || browserCase === 'login') {
    phase = 'SUBSCRIPTION_NEGATIVES';
    const cookies = await context.cookies();
    const cookieHeader = cookies.filter(item => ['st_v2_access', 'st_v2_binding', 'st_v2_chain'].includes(item.name))
      .map(item => `${item.name}=${item.value}`).join('; ');
    const headers = { Origin: origin, Cookie: cookieHeader, 'X-Session-CSRF': csrf };
    const detailPath = wire.find(x => x.method === 'POST' && /^\/v2\/subscriptions\/[0-9a-f-]+\/read$/.test(x.path))?.path;
    assert(detailPath);
    const selectedId = detailPath.split('/')[3];
    const foreignId = fs.readFileSync(path.join(handshake, 'foreign-id'), 'utf8');
    assert(/^[0-9a-f-]{36}$/.test(foreignId));
    const missingId = randomUUID();
    const repeat = await request(headers, '{"mode":"just-me"}', '/v2/me/mode');
    assert.equal(repeat.status, 200);
    assert.deepEqual(repeat.body, { mode: 'just-me' });
    closedProblem(await request(headers, '{"mode":"just-me","mode":"just-me"}', '/v2/me/mode'), 400, 'INVALID_MODE_REQUEST');
    closedProblem(await request(headers, '{"cursor":"bad"}', '/v2/subscriptions/owner/read'), 400, 'INVALID_SUBSCRIPTION_REQUEST');
    closedProblem(await request(headers, '{"cursor":"x","cursor":"x"}', '/v2/subscriptions/owner/read'), 400, 'INVALID_SUBSCRIPTION_REQUEST');
    closedProblem(await request(headers, '{"owner":"foreign"}', '/v2/subscriptions/owner/read'), 400, 'INVALID_SUBSCRIPTION_REQUEST');
    closedProblem(await request({ ...headers, Origin: 'https://other.invalid' }, '{}', '/v2/subscriptions/owner/read'), 403, 'SUBSCRIPTION_REQUEST_REJECTED');
    closedProblem(await request({ ...headers, Cookie: `${cookieHeader}; st_v2_chain=duplicate` }, '{}', '/v2/subscriptions/owner/read'), 400, 'INVALID_SUBSCRIPTION_REQUEST');
    const missing = await request(headers, '{}', `/v2/subscriptions/${missingId}/read`);
    const foreign = await request(headers, '{}', `/v2/subscriptions/${foreignId}/read`);
    closedProblem(missing, 404, 'SUBSCRIPTION_NOT_FOUND');
    closedProblem(foreign, 404, 'SUBSCRIPTION_NOT_FOUND');
    assert.deepEqual(foreign.body, missing.body);
    closedProblem(await request(headers, '{"status":"PAUSED"}', `/v2/subscriptions/${selectedId}`, false, 'PATCH'), 409, 'LIFECYCLE_CONFLICT');
    closedProblem(await request(headers, '{"status":"ARCHIVED","status":"ARCHIVED"}', `/v2/subscriptions/${selectedId}`, false, 'PATCH'), 400, 'INVALID_SUBSCRIPTION_REQUEST');
    closedProblem(await request(headers, '{"status":"PAUSED"}', `/v2/subscriptions/${foreignId}`, false, 'PATCH'), 404, 'SUBSCRIPTION_NOT_FOUND');
    closedProblem(await request(headers, '{"status":"PAUSED"}', `/v2/subscriptions/${missingId}`, false, 'PATCH'), 404, 'SUBSCRIPTION_NOT_FOUND');
    process.stdout.write('PASS ST238_BROWSER_OWNER_HTTPS_MODE_LIST_DETAIL_STATUS_NEGATIVES\n');
    assert(wire.some(x => x.method === 'POST' && x.path === '/v2/me/mode' && x.status === 200));
    assert(wire.some(x => x.method === 'POST' && x.path === '/v2/me/mode/read' && x.status === 200));
    assert.equal(wire.filter((x, index) => index >= (browserCase === 'login' ? aliceReturnStart : 0) &&
      x.method === 'POST' && x.path === '/v2/subscriptions/owner/read' && x.status === 200).length, 2);
    assert(wire.some(x => x.method === 'PATCH' && /^\/v2\/subscriptions\/[0-9a-f-]+$/.test(x.path) && x.status === 200));
    assert(wire.filter(x => x.method === 'POST' && /^\/v2\/subscriptions\/[0-9a-f-]+\/read$/.test(x.path) && x.status === 200).length >= 2);
    await assertSafeWire();
    await capture('subscription-status');
    if (browserCase === 'login') {
      phase = 'LOGIN_RELOAD';
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: copy.login.freshLogin, exact: true }).waitFor();
      assert.equal(await page.getByRole('region', { name: copy.ownerSubscriptions.title, exact: true }).count(), 0);
      await capture('login-reload-stop');
      phase = 'LOGIN_UNCERTAIN_RETURN';
      await page.getByRole('link', { name: copy.login.freshLogin, exact: true }).click();
      await page.getByRole('heading', { name: copy.login.title, exact: true }).waitFor();
      await capture('login-fresh-after-reload');
      let uncertainSessions = 0;
      const loseSession = async route => {
        uncertainSessions++;
        const committed = await route.fetch();
        assert.equal(committed.status(), 201);
        await checkPrivateHeaders(committed, '/v2/auth/session');
        await route.abort('failed');
      };
      await page.route('**/v2/auth/session', loseSession);
      await page.getByRole('button', { name: copy.login.simulatorAction, exact: true }).click();
      await page.getByText(copy.login.unavailable, { exact: true }).waitFor();
      assert.equal(uncertainSessions, 1);
      assert.equal(await page.getByRole('region', { name: copy.ownerSubscriptions.title, exact: true }).count(), 0);
      await capture('login-unavailable-stop');
      await page.unroute('**/v2/auth/session', loseSession);
      phase = 'LOGIN_FRESH_RECOVERY';
      await page.getByRole('button', { name: copy.login.freshLogin, exact: true }).click();
      await page.getByRole('heading', { name: copy.ownerSubscriptions.title, exact: true }).waitFor();
      assert.equal(await page.getByRole('region', { name: copy.ownerSubscriptions.title, exact: true }).getByRole('listitem').count(), 50);
      await capture('login-fresh-recovered-list');
      await assertSafeWire();
      process.stdout.write(`PASS ST239_BROWSER_RETURNING_LOGIN locale=${locale} theme=${theme}\n`);
      process.stdout.write(`PASS ST239_BROWSER_NATURAL_SECOND_OWNER_INCOMPLETE_ABSENT_MODE_ISOLATION locale=${locale} theme=${theme}\n`);
      process.stdout.write(`PASS ST239_BROWSER_LOST_SESSION_RESPONSE_FRESH_RECOVERY locale=${locale} theme=${theme}\n`);
      process.stdout.write(`PASS ST237_BROWSER_CASE case=login locale=${locale} theme=${theme}\n`);
    } else {
      process.stdout.write(`PASS ST238_BROWSER_NATURAL_OWNER_MODE_LIST_51_DETAIL_STATUS locale=${locale} theme=${theme}\n`);
      process.stdout.write(`PASS ST237_BROWSER_CASE case=subscriptions locale=${locale} theme=${theme}\n`);
    }
    }
  } else {
  phase = 'PROFILE_WIRE';
  await assertSafeWire();
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
  const wrongHost = await request({ ...baseHeaders, Host: 'other.invalid' }, '{}', '/v2/me/profile/read', true);
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
  phase = 'RELOAD_NAVIGATE';
  const reloadUrl = page.url();
  assert.equal(reloadUrl, first.url());
  const beforeReloadTimeOrigin = await page.evaluate(() => globalThis.performance.timeOrigin);
  const reloadDeadline = Date.now() + 45000;
  let reloadAttempted = false;
  let resolveDocumentResponse;
  const documentResponse = new Promise(resolve => { resolveDocumentResponse = resolve; });
  const onReloadResponse = response => {
    if (!reloadAttempted || response.url() !== reloadUrl || response.status() !== 200) return;
    try {
      const request = response.request();
      if (request.isNavigationRequest() && request.resourceType() === 'document' &&
          request.frame() === page.mainFrame()) resolveDocumentResponse(true);
    } catch { /* A failed frame lookup does not establish a committed document. */ }
  };
  page.on('response', onReloadResponse);
  try {
    reloadAttempted = true;
    try {
      const reloaded = await page.reload({ waitUntil: 'domcontentloaded' });
      reloadStatus = reloaded ? [200, 304, 400, 404, 500].includes(reloaded.status()) ? String(reloaded.status()) : 'OTHER' : 'NONE';
    } catch (caught) {
      if (reloadFailureClass(caught) !== 'ABORT' || page.isClosed()) throw caught;
      const remaining = () => Math.max(0, reloadDeadline - Date.now());
      assert(remaining() > 0);
      await page.waitForFunction(({ url, timeOrigin }) =>
        globalThis.location.href === url && globalThis.performance.timeOrigin > timeOrigin &&
        globalThis.performance.getEntriesByType('navigation')[0]?.type === 'reload',
      { url: reloadUrl, timeOrigin: beforeReloadTimeOrigin }, { timeout: remaining() });
      assert(remaining() > 0);
      const sawDocumentResponse = await new Promise(resolve => {
        const timer = setTimeout(() => resolve(false), remaining());
        documentResponse.then(() => { clearTimeout(timer); resolve(true); });
      });
      assert(sawDocumentResponse);
      assert.equal(page.url(), reloadUrl);
      reloadStatus = '200';
    }
  } finally { page.off('response', onReloadResponse); }
  await capture('reloaded');
  const observedNavigationType = await page.evaluate(() =>
    globalThis.performance.getEntriesByType('navigation')[0]?.type);
  reloadNavigationType = ['reload', 'navigate', 'back_forward', 'prerender']
    .includes(observedNavigationType) ? observedNavigationType : observedNavigationType === undefined ? 'NONE' : 'OTHER';
  phase = 'RELOAD_STOP';
  await page.getByText(copy.registration.verifiedLoginRequired, { exact: true }).waitFor();
  phase = 'RELOAD_ABSENT';
  assert.equal(await profileRegion.getByLabel(copy.profile.displayName, { exact: true }).count(), 0);
  await capture('reload-stop');
  process.stdout.write(`PASS ST237_BROWSER_ENROLLMENT_PROFILE locale=${locale} theme=${theme}\n`);
  process.stdout.write('PASS ST237_BROWSER_CURRENT_AUTHORITY_NEGATIVES\nPASS ST237_BROWSER_RELOAD_STOP\n');
  process.stdout.write(`PASS ST237_BROWSER_CASE case=profile locale=${locale} theme=${theme}\n`);
  }
  }
  if (browserCase === 'partial-terminal') {
  phase = 'PARTIAL_SETUP';
  await context.clearCookies();
  const partialPage = await context.newPage();
  partialPage.setDefaultTimeout(45000);
  await partialPage.addInitScript(selected => globalThis.localStorage.setItem('theme-preference', selected), theme);
  let completionRequests = 0;
  let committedCompletion = false;
  let resolveRouteSettled;
  const routeSettled = new Promise(resolve => { resolveRouteSettled = resolve; });
  partialPage.on('request', incoming => {
    if (new URL(incoming.url()).pathname === '/v2/auth/enrollment/complete') {
      completionRequests++;
      partialCompletionCount = completionRequests === 1 ? 'ONE' : 'MANY';
    }
  });
  await partialPage.route('**/v2/auth/enrollment/complete', async route => {
    try {
      const committed = await route.fetch();
      partialCompletion = [201, 400, 401, 403, 409, 500].includes(committed.status()) ? String(committed.status()) : 'OTHER';
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
      partialRoute = 'OK';
    } catch {
      partialRoute = 'FAILED';
      try { await route.abort('failed'); } catch { /* Keep the failure in the closed main-flow receipt. */ }
    } finally { resolveRouteSettled(); }
  });
  phase = 'PARTIAL_NAVIGATE';
  const partialStart = await partialPage.goto(`${origin}/${locale}/register?st237_probe=${randomUUID()}`,
    { waitUntil: 'domcontentloaded' });
  partialNavigation = partialStart ? [200, 304, 400, 404, 500].includes(partialStart.status()) ? String(partialStart.status()) : 'OTHER' : 'NONE';
  assert.equal(partialStart?.status(), 200);
  phase = 'PARTIAL_READY';
  const partialThemeButton = partialPage.getByRole('navigation', { name: preferenceCopy.label, exact: true })
    .getByRole('button', { name: preferenceCopy.themes[theme], exact: true });
  await partialThemeButton.waitFor({ state: 'visible' });
  await partialPage.waitForFunction(({ label, name }) => [...globalThis.document.querySelectorAll('nav[aria-label]')]
    .some(nav => nav.getAttribute('aria-label') === label && [...nav.querySelectorAll('button')]
      .some(button => button.textContent === name && button.getAttribute('aria-pressed') === 'true')),
  { label: preferenceCopy.label, name: preferenceCopy.themes[theme] });
  await partialThemeButton.click();
  await partialPage.waitForFunction(selected => globalThis.localStorage.getItem('theme-preference') === selected, theme);
  await partialPage.getByRole('heading', { name: copy.registration.title, exact: true }).waitFor();
  await partialPage.screenshot({ path: path.join(screenshotDir, 'partial-identifier.png'), fullPage: true });
  phase = 'PARTIAL_FILL';
  await partialPage.getByLabel(copy.identifier.emailLabel, { exact: true }).fill(`partial-${randomUUID()}@example.test`);
  phase = 'PARTIAL_SUBMIT';
  await partialPage.getByRole('button', { name: copy.identifier.continueLabel, exact: true }).click();
  phase = 'PARTIAL_OTP';
  await partialPage.getByLabel(copy.registration.otpLabel, { exact: true }).fill('123456');
  await partialPage.getByRole('button', { name: copy.registration.verifyLabel, exact: true }).click();
  phase = 'PARTIAL_SIMULATOR';
  await partialPage.getByRole('button', { name: copy.registration.simulatorAction, exact: true }).waitFor();
  const deniedRead = partialPage.waitForResponse(response =>
    new URL(response.url()).pathname === '/v2/me/profile/read' && response.request().method() === 'POST')
    .then(response => response, () => null);
  phase = 'PARTIAL_COMPLETE';
  const partialCompletionDeadline = Date.now() + 45000;
  await partialPage.getByRole('button', { name: copy.registration.simulatorAction, exact: true }).click();
  phase = 'PARTIAL_READ';
  const denied = await deniedRead;
  partialRead = denied ? [200, 400, 401, 403, 409, 500].includes(denied.status()) ? String(denied.status()) : 'OTHER' : 'NONE';
  assert(denied);
  const remainingRouteWait = Math.max(0, partialCompletionDeadline - Date.now());
  assert(remainingRouteWait > 0);
  const observedRouteSettlement = await new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), remainingRouteWait);
    routeSettled.then(() => { clearTimeout(timer); resolve(true); });
  });
  assert(observedRouteSettlement);
  assert(committedCompletion);
  assert.equal(completionRequests, 1);
  assert.equal(partialRoute, 'OK');
  assert.equal(denied.status(), 403);
  const deniedBody = await denied.json();
  assert.deepEqual(Object.keys(deniedBody).sort(), ['code', 'status', 'title', 'type']);
  assert.equal(deniedBody.code, 'PROFILE_REQUEST_REJECTED');
  phase = 'PARTIAL_STOP';
  await partialPage.getByText(copy.registration.verifiedLoginRequired, { exact: true }).waitFor();
  assert.equal(await partialPage.getByRole('region', { name: copy.profile.title, exact: true })
    .getByLabel(copy.profile.displayName, { exact: true }).count(), 0);
  phase = 'PARTIAL_COOKIES';
  const retained = await context.cookies();
  assert(retained.some(cookie => cookie.name === 'st_v2_access'));
  assert(retained.some(cookie => cookie.name === 'st_v2_binding'));
  assert(!retained.some(cookie => cookie.name === 'st_v2_chain' || cookie.name === 'st_v2_refresh'));
  assert.equal(completionRequests, 1);
  await partialPage.screenshot({ path: path.join(screenshotDir, 'partial-terminal-stop.png'), fullPage: true });
  await partialPage.close();
  process.stdout.write('PASS ST237_BROWSER_COMMITTED_PARTIAL_TERMINAL_COOKIE_STOP\n');
  process.stdout.write(`PASS ST237_BROWSER_CASE case=partial-terminal locale=${locale} theme=${theme}\n`);
  }
} catch (caught) {
  if (browserCase === 'login' && screenshotDir && page && !page.isClosed()) {
    try { await page.screenshot({ path: path.join(screenshotDir, 'login-failure.png'), fullPage: true,
      mask: [page.locator('#registration-otp'), page.locator('input[type="password"]')] }); }
    catch { /* Preserve the original closed failure receipt. */ }
  }
  if (phase === 'RELOAD_NAVIGATE') {
    reloadError = reloadFailureClass(caught);
    reloadPageClosed = page?.isClosed() ? 'YES' : 'NO';
  }
  if (phase === 'AUTHORITY_NEGATIVES') process.stderr.write(`ST237_NEGATIVE_GATE case=${negativeCase} status=${negativeStatus} network=${negativeNetwork}\n`);
  process.stderr.write(`FAIL ST237_BROWSER_CASE case=${browserCase} phase=${phase} navigation=${navigationStatus} patch=${profileWire.patch} read=${profileWire.read} reloadNavigation=${reloadNavigationType} reloadStatus=${reloadStatus} reloadError=${reloadError} reloadPageClosed=${reloadPageClosed} reloadRequestFailure=${reloadRequestFailure} partialNavigation=${partialNavigation} partialCompletion=${partialCompletion} partialRead=${partialRead} partialCompletionCount=${partialCompletionCount} partialRoute=${partialRoute}\n`);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
}
