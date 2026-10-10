const { chromium } = require('../../../packages/ui/node_modules/playwright');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Uses a built local web app. Only OTP network calls are fixtures, never real delivery.
(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const locale of ['sv', 'en']) {
      const copy = JSON.parse(readFileSync(path.resolve(__dirname, '../../../packages/i18n/catalogs', `${locale}.json`), 'utf8')).onboarding;
      for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: theme });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        let verifyCount = 0;
        await page.route('**/api/v2/auth/**', async (route) => {
          const url = route.request().url();
          const body = url.endsWith('/browser-nonce') ? { nonce: 'fixture-nonce' }
            : url.endsWith('/otp/start') ? { challengeId: 'fixture-challenge', status: 'accepted', nextBrowserNonce: 'fixture-next' }
              : { purpose: 'enroll_identifier', proof: 'fixture-secret', nextBrowserNonce: 'fixture-final' };
          if (url.endsWith('/otp/verify') && verifyCount++ === 0) {
            await route.fulfill({ status: 401, contentType: 'application/problem+json', body: JSON.stringify({ type: 'about:blank', title: 'Unauthorized', status: 401, code: 'AUTH_INVALID' }) });
          } else await route.fulfill({ status: url.endsWith('/otp/start') ? 202 : 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        const response = await page.goto(`http://127.0.0.1:3100/${locale}/register`);
        assert.equal(response.status(), 200);
        await page.getByLabel(copy.identifier.emailLabel).fill('fixture@example.test');
        await page.getByRole('button', { name: copy.identifier.continueLabel, exact: true }).click();
        await page.getByLabel(copy.registration.otpLabel).waitFor();
        await page.screenshot({ path: path.join(__dirname, `${locale}-${theme}-otp.png`), fullPage: true });
        await page.getByLabel(copy.registration.otpLabel).fill('123456');
        await page.getByRole('button', { name: copy.registration.verifyLabel, exact: true }).click();
        await page.getByRole('button', { name: copy.registration.restartRequired, exact: true }).waitFor();
        await page.screenshot({ path: path.join(__dirname, `${locale}-${theme}-restart.png`), fullPage: true });
        await page.getByRole('button', { name: copy.registration.restartRequired, exact: true }).click();
        assert.equal(await page.getByLabel(copy.registration.otpLabel).inputValue(), '');
        await page.getByLabel(copy.registration.otpLabel).fill('654321');
        await page.getByRole('button', { name: copy.registration.verifyLabel, exact: true }).click();
        await page.getByRole('status').filter({ hasText: copy.registration.acceptedMessage }).waitFor();
        assert(!(await page.locator('body').innerText()).includes('fixture-secret'));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
        results.push({ locale, theme, status: 'PASS', mockedOtp: true, overflow: false, pageErrors: errors });
        await page.close();
      }
    }
    writeFileSync(path.join(__dirname, 'browser-qa.json'), JSON.stringify({ results, limitation: 'Actual built registration routes; mocked OTP. Does not prove reverse proxy, backend, BankID, delivery or completed onboarding.' }, null, 2) + '\n');
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
