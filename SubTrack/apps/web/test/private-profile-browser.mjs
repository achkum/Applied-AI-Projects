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
const copy = JSON.parse(fs.readFileSync(path.join(webDir, '../../packages/i18n/catalogs', `${locale}.json`), 'utf8')).onboarding;
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
    const req = https.request(`${origin}${pathname}`, { method: 'POST', ca, headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers } }, res => {
      const parts = []; res.on('data', part => parts.push(part)); res.on('end', () => {
        try { const text = Buffer.concat(parts).toString('utf8');
          resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null });
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject); req.end(body);
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
  phase = 'IDENTIFIER';
  const first = await page.goto(`${origin}/${locale}/register?st237_probe=${randomUUID()}`, { waitUntil: 'domcontentloaded' });
  assert.equal(first?.status(), 200);
  await page.evaluate(selected => { globalThis.document.documentElement.setAttribute('data-theme', selected); }, theme);
  await page.getByRole('heading', { name: copy.registration.title, exact: true }).waitFor();
  await capture('identifier');
  await page.getByLabel(copy.identifier.emailLabel, { exact: true }).fill('private-proof@example.test');
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
  await page.getByLabel(copy.profile.displayName, { exact: true }).waitFor();
  await capture('profile');
  await page.getByLabel(copy.profile.displayName, { exact: true }).fill('Private Proof');
  await page.getByLabel(copy.profile.language, { exact: true }).selectOption(locale);
  await page.getByLabel(copy.profile.theme, { exact: true }).selectOption(theme);
  await page.getByRole('button', { name: copy.profile.save, exact: true }).click();
  await page.getByText(copy.profile.saved, { exact: true }).waitFor();
  await capture('saved');
  assert.equal(await page.getByLabel(copy.profile.displayName, { exact: true }).inputValue(), 'Private Proof');
  assert(safeWire);
  const paths = ['/v2/auth/browser-nonce', '/v2/auth/otp/start', '/v2/auth/otp/verify',
    '/v2/auth/enrollment/pending', '/v2/auth/enrollment/simulator/verify', '/v2/auth/enrollment/complete'];
  for (const target of paths) assert.equal(wire.filter(item => item.path === target).length, 1);
  const patchAt = wire.findIndex(item => item.method === 'PATCH' && item.path === '/v2/me/profile' && item.status === 200);
  assert(patchAt > 0);
  assert(wire.slice(patchAt + 1).some(item => item.method === 'POST' && item.path === '/v2/me/profile/read' && item.status === 200));
  assert(credentialNames.has('st_v2_access') && credentialNames.has('st_v2_refresh') && credentialNames.has('st_v2_chain'));
  const cookies = await context.cookies();
  for (const name of ['st_v2_access', 'st_v2_refresh', 'st_v2_chain']) {
    const cookie = cookies.find(value => value.name === name);
    assert(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax' && cookie.domain === 'localhost');
    assert.equal(cookie.path, name === 'st_v2_refresh' ? '/v2/auth' : '/v2');
  }
  phase = 'AUTHORITY_NEGATIVES';
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
  assert.deepEqual(statuses, [401, 400, 400, 200]);
  const cookieHeader = cookies.filter(item => ['st_v2_access', 'st_v2_binding', 'st_v2_chain'].includes(item.name))
    .map(item => `${item.name}=${item.value}`).join('; ');
  const names = Object.fromEntries(cookies.map(item => [item.name, item.value]));
  assert.equal(Object.keys(names).filter(name => name.startsWith('st_v2_')).length, 4);
  const baseHeaders = { Origin: origin, Cookie: cookieHeader, 'X-Session-CSRF': csrf };
  const negativeCases = [
    [{ ...baseHeaders, Origin: 'https://other.invalid' }, 403, 'PROFILE_REQUEST_REJECTED'],
    [{ ...baseHeaders, Cookie: cookieHeader.split('; ').filter(item => !item.startsWith('st_v2_chain=')).join('; ') }, 403, 'PROFILE_REQUEST_REJECTED'],
    [{ ...baseHeaders, Cookie: cookieHeader.replace(names.st_v2_chain, `${names.st_v2_chain.startsWith('A') ? 'B' : 'A'}${names.st_v2_chain.slice(1)}`) }, 401, 'AUTHENTICATION_REQUIRED'],
    [{ ...baseHeaders, Cookie: `${cookieHeader}; st_v2_chain=${names.st_v2_chain}` }, 400, 'INVALID_PROFILE_REQUEST'],
    [{ ...baseHeaders, Cookie: cookieHeader.split('; ').filter(item => !item.startsWith('st_v2_binding=')).join('; ') }, 403, 'PROFILE_REQUEST_REJECTED'],
    [{ ...baseHeaders, Cookie: cookieHeader.replace(names.st_v2_binding, `${names.st_v2_binding.startsWith('A') ? 'B' : 'A'}${names.st_v2_binding.slice(1)}`) }, 401, 'AUTHENTICATION_REQUIRED'],
    [{ ...baseHeaders, Cookie: `${cookieHeader}; st_v2_refresh=${names.st_v2_refresh}` }, 403, 'PROFILE_REQUEST_REJECTED'],
    [{ ...baseHeaders, 'X-Session-CSRF': undefined }, 403, 'PROFILE_REQUEST_REJECTED'],
  ];
  for (const [headers, status, code] of negativeCases) {
    const supplied = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
    closedProblem(await request(supplied), status, code);
  }
  const wrongHost = await request({ ...baseHeaders, Host: 'other.invalid' });
  assert.equal(wrongHost.status, 421);
  assert.equal(wrongHost.headers['cache-control'], 'no-store');
  assert.equal(wrongHost.headers.pragma, 'no-cache');
  closedProblem(await request(baseHeaders, '{"x":1,"x":2}'), 400, 'INVALID_PROFILE_REQUEST');
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
  await page.getByLabel(copy.profile.displayName, { exact: true }).fill('Private Proof Updated');
  await page.getByRole('button', { name: copy.profile.save, exact: true }).dblclick();
  await page.getByText(copy.profile.uncertain, { exact: true }).waitFor();
  assert.equal(committedPatchCount, 1);
  const afterLostResponse = await request(baseHeaders);
  assert.equal(afterLostResponse.status, 200);
  assert.equal(afterLostResponse.body.displayName, 'Private Proof Updated');
  process.stdout.write('PASS ST237_BROWSER_COMMITTED_PATCH_LOST_RESPONSE_SINGLE_SUBMISSION\n');
  csrf = '';
  phase = 'RELOAD';
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText(copy.registration.verifiedLoginRequired, { exact: true }).waitFor();
  assert.equal(await page.getByLabel(copy.profile.displayName, { exact: true }).count(), 0);
  await capture('reload-stop');
  process.stdout.write(`PASS ST237_BROWSER_ENROLLMENT_PROFILE locale=${locale} theme=${theme}\n`);
  process.stdout.write('PASS ST237_BROWSER_CURRENT_AUTHORITY_NEGATIVES\nPASS ST237_BROWSER_RELOAD_STOP\n');
} catch {
  process.stderr.write(`FAIL ST237_BROWSER_PROFILE phase=${phase}\n`);
  process.exitCode = 1;
} finally {
  if (context) await context.close();
}
