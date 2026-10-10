const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../../packages/ui/node_modules/playwright'));
const out = __dirname;
(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const locale of ['en', 'sv']) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: theme });
      await context.addInitScript(({ locale, theme }) => { localStorage.setItem('locale-preference', locale); localStorage.setItem('theme-mode-preference', theme); }, { locale, theme });
      const page = await context.newPage();
      const requests = [], errors = [];
      page.on('request', r => requests.push(new URL(r.url()).pathname));
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://127.0.0.1:8093/register', { waitUntil: 'networkidle' });
      const copy = require(path.resolve(__dirname, '../../../packages/i18n/catalogs', `${locale}.json`)).onboarding.identifier;
      await page.getByText(copy.channelLabel, { exact: true }).waitFor();
      await page.getByRole('button', { name: copy.continueLabel }).waitFor();
      await page.screenshot({ path: path.join(out, `static-register-${locale}-${theme}.png`), fullPage: true });
      assert.equal(errors.length, 0, `${locale}/${theme} page errors`);
      assert.equal(requests.filter(p => /mobile\/enrollment|\/api\//.test(p)).length, 0, `${locale}/${theme} backend request`);
      results.push({ locale, theme, route: '/register', width: 375, height: 812, requestCount: requests.length, errors: errors.length, screenshot: `static-register-${locale}-${theme}.png` });
      await context.close();
    }
    require('node:fs').writeFileSync(path.join(out, 'static-registration-qa.json'), JSON.stringify({ outcome: 'PASS', results, limitations: ['Actual Expo static web registration route only; OTP/BankID use prior test-only fixtures. No native, TLS, delivery, or provider claim.'] }, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
