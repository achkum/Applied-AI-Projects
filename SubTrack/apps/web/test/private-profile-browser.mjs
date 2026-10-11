// Actual natural browser driver; no credential bodies, console messages or traces leave task custody.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
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
let phase = 'LAUNCH';
let context;
try {
  context = await firefox.launchPersistentContext(process.env.ST237_TRUSTED_PROFILE, { headless: true });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const screenshotDir = path.resolve(process.env.RUNNER_TEMP, 'st237-profile-screenshots');
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
  csrf = '';
  const storage = await page.evaluate(() => ({ local: Object.keys(globalThis.localStorage), session: Object.keys(globalThis.sessionStorage) }));
  assert(storage.local.every(key => /theme|locale/i.test(key)) && storage.session.length === 0);
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
