const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');
const { chromium } = require(path.join(repoRoot, 'packages/ui/node_modules/playwright'));
const catalogs = Object.fromEntries(['en', 'sv'].map((locale) => [
  locale,
  JSON.parse(fs.readFileSync(path.join(repoRoot, `packages/i18n/catalogs/${locale}.json`), 'utf8')),
]));
const baseUrl = process.env.SUBTRACK_MOBILE_WEB_URL ?? 'http://localhost:8091';
const email = 'route.smoke@example.test';
const results = [];
const requests = [];
const pageErrors = [];
const consoleErrors = [];
const failedResponses = [];

function route(url) {
  const parsed = new URL(url);
  return { pathname: parsed.pathname, search: parsed.search };
}

async function visibleBackground(page) {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('[style*="background-color"]'));
    const painted = candidates.map((element) => {
      const rect = element.getBoundingClientRect();
      return { color: window.getComputedStyle(element).backgroundColor, area: rect.width * rect.height };
    }).filter(({ color }) => color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent');
    const largestArea = Math.max(0, ...painted.map(({ area }) => area));
    return painted.filter(({ area }) => area === largestArea && area > 0).at(-1)?.color ?? null;
  });
}

async function screenshot(page, locale, theme, state) {
  const name = `expo-web-${locale}-${theme}-${state}.png`;
  await page.screenshot({ path: path.join(__dirname, name), fullPage: true });
  return name;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const locale of ['en', 'sv']) {
      for (const theme of ['light', 'dark']) {
        const copy = catalogs[locale].onboarding;
        const registration = copy.registration;
        const welcome = copy.welcome;
        const identifier = copy.identifier;
        const context = await browser.newContext({
          viewport: { width: 375, height: 812 },
          colorScheme: theme,
        });
        await context.addInitScript((preferences) => {
          window.localStorage.setItem('locale-preference', preferences.locale);
          window.localStorage.setItem('theme-mode-preference', preferences.theme);
        }, { locale, theme });
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('response', (response) => {
          if (response.status() >= 400) {
            const parsed = new URL(response.url());
            const detail = { status: response.status(), pathname: parsed.pathname };
            failedResponses.push(detail);
            void response.text().then((body) => {
              try {
                const payload = JSON.parse(body);
                detail.targetModuleName = payload.targetModuleName ?? null;
                detail.originIsWorkspaceRoot = /[\\/]\.$/.test(payload.originModulePath ?? '');
                detail.resolutionError = payload.message?.match(/^Unable to resolve module ([^\n]+)/)?.[1] ?? null;
                detail.candidatePrefixes = Object.values(payload.cause?.candidates ?? {})
                  .map((candidate) => candidate.file?.filePathPrefix ?? candidate.dir?.filePathPrefix ?? null)
                  .filter(Boolean);
              } catch {
                detail.resolutionError = 'Expo returned a non-JSON error body.';
              }
            });
          }
        });

        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
          () => document.querySelector('[role="button"]') !== null,
          { timeout: 20_000 },
        ).catch(() => undefined);
        await page.waitForTimeout(100);
        const rootMarkup = await page.locator('#root').innerHTML();
        if (!rootMarkup.trim()) {
          await context.close();
          let metroResolution = null;
          const bundleFailure = failedResponses.find((response) => response.pathname === '/index.bundle');
          if (bundleFailure) {
            try {
              const response = await fetch(`${baseUrl}/index.bundle?platform=web&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app`);
              const payload = await response.json();
              metroResolution = {
                targetModuleName: payload.targetModuleName ?? null,
                originRelativeToWorkspace: path.relative(repoRoot, path.resolve(payload.originModulePath ?? repoRoot)),
                candidatePrefixes: Object.values(payload.cause?.candidates ?? {})
                  .map((candidate) => candidate.file?.filePathPrefix ?? candidate.dir?.filePathPrefix ?? null)
                  .filter(Boolean),
              };
            } catch {
              metroResolution = { diagnostic: 'Unable to read Metro resolver response.' };
            }
          }
          const report = {
            date: new Date().toISOString(),
            baseUrl,
            outcome: 'BLOCKED',
            reason: 'Expo Web entry did not render the app root, so route smoke assertions could not run.',
            failedResponses,
            metroResolution,
            consoleErrors,
            pageErrors,
            requestCount: requests.length,
            authRequestCount: requests.filter(({ url }) => /\/(?:v\d+\/)?(?:auth|otp|session|bankid)(?:\/|\?|$)/i.test(new URL(url).pathname)).length,
            identifierRequestCount: requests.filter(({ url }) => url.includes(email)).length,
            screenshots: [],
            limitations: ['No route or privacy outcome is claimed from this blocked browser run.', 'Native device and screen-reader QA were not run.'],
          };
          fs.writeFileSync(path.join(__dirname, 'expo-web-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
          process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
          return;
        }

        await page.getByRole('button', { name: welcome.createAccount }).waitFor();
        assert.deepEqual(route(page.url()), { pathname: '/welcome', search: '' });
        assert.equal(await page.getByRole('heading', { name: 'SubTrack' }).count(), 1);
        const welcomeBackground = await visibleBackground(page);
        const welcomeShot = await screenshot(page, locale, theme, 'welcome');

        await page.getByRole('button', { name: welcome.createAccount }).click();
        await page.getByLabel(identifier.emailLabel).waitFor();
        assert.deepEqual(route(page.url()), { pathname: '/register', search: '' });
        const registerShot = await screenshot(page, locale, theme, 'register');
        await page.getByLabel(identifier.emailLabel).fill(email);
        await page.getByRole('button', { name: identifier.continueLabel }).click();
        await page.getByText(registration.unavailable).waitFor();
        await page.getByRole('alert').waitFor();
        const unavailableText = await page.locator('body').innerText();
        assert.ok(unavailableText.includes(registration.identifierValid));
        assert.ok(unavailableText.includes(registration.bankIdRequired));
        assert.ok(unavailableText.includes(registration.unavailable));
        assert.ok(!unavailableText.includes(email));
        assert.deepEqual(route(page.url()), { pathname: '/register', search: '' });
        const unavailableShot = await screenshot(page, locale, theme, 'unavailable');

        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: welcome.logIn }).click();
        await page.getByText(registration.loginUnavailable).waitFor();
        assert.deepEqual(route(page.url()), { pathname: '/register', search: '?mode=login' });
        assert.equal(await page.getByLabel(identifier.emailLabel).count(), 0);
        const loginShot = await screenshot(page, locale, theme, 'login-unavailable');

        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: welcome.exploreDemo }).click();
        await page.getByText(catalogs[locale].mobileDemo.banner).waitFor();
        assert.deepEqual(route(page.url()), { pathname: `/${locale}/demo`, search: '' });
        const demoShot = await screenshot(page, locale, theme, 'demo');
        const demoText = await page.locator('body').innerText();
        assert.ok(demoText.includes(catalogs[locale].mobileDemo.banner));

        results.push({
          locale,
          theme,
          routes: ['/', '/welcome', '/register', '/register?mode=login', `/${locale}/demo`],
          welcomeBackground,
          screenshots: [welcomeShot, registerShot, unavailableShot, loginShot, demoShot],
        });
        await context.close();
      }
    }

    assert.deepEqual(pageErrors, []);
    const externalRequests = requests.filter(({ url }) => {
      const parsed = new URL(url);
      return parsed.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(parsed.hostname);
    });
    const authRequests = requests.filter(({ url }) => /\/(?:v\d+\/)?(?:auth|otp|session|bankid)(?:\/|\?|$)/i.test(new URL(url).pathname));
    const identifierRequests = requests.filter(({ url }) => url.includes(email));
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(authRequests, []);
    assert.deepEqual(identifierRequests, []);

    const lightBackgrounds = results.filter((result) => result.theme === 'light').map((result) => result.welcomeBackground);
    const darkBackgrounds = results.filter((result) => result.theme === 'dark').map((result) => result.welcomeBackground);
    assert.ok(lightBackgrounds.every(Boolean));
    assert.ok(darkBackgrounds.every(Boolean));
    assert.ok(lightBackgrounds[0] !== darkBackgrounds[0]);

    const report = {
      date: new Date().toISOString(),
      baseUrl,
      viewport: { width: 375, height: 812 },
      results,
      requestCount: requests.length,
      externalRequestCount: externalRequests.length,
      authRequestCount: authRequests.length,
      identifierRequestCount: identifierRequests.length,
      pageErrorCount: pageErrors.length,
      outcome: 'PASS',
      limitations: ['Expo Web route smoke only; no native device, screen-reader, BankID, OTP, or signup-authority claim.'],
    };
    fs.writeFileSync(path.join(__dirname, 'expo-web-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
