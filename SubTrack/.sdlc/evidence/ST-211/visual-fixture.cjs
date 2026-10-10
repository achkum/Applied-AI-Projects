const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '../../..');
const { chromium } = require(path.join(repo, 'packages/ui/node_modules/playwright'));
const catalogs = Object.fromEntries(['en', 'sv'].map((locale) => [locale, JSON.parse(fs.readFileSync(path.join(repo, `packages/i18n/catalogs/${locale}.json`), 'utf8'))]));
const base = process.env.SUBTRACK_MOBILE_WEB_URL ?? 'http://localhost:8091';
const pageErrors = [], requests = [], shots = [];
async function injectFlow(page, value) {
  await page.evaluate((flow) => {
    const root = document.getElementById('root');
    const key = Object.keys(root).find((item) => item.startsWith('__reactContainer$'));
    let fiber = root[key]?.current ?? root[key];
    const visit = (node) => {
      if (!node) return null;
      if (node.type?.name === 'EnrollmentProvider') return node;
      return visit(node.child) ?? visit(node.sibling);
    };
    const provider = visit(fiber);
    if (!provider) {
      const found = [];
      const walk = (node) => { if (!node) return; found.push({ name: node.type?.name, displayName: node.type?.displayName, key: node.key, hooks: node.memoizedState && typeof node.memoizedState === 'object' ? Object.keys(node.memoizedState) : null }); walk(node.child); walk(node.sibling); };
      walk(fiber);
      throw new Error(`EnrollmentProvider not found: ${JSON.stringify(found)}`);
    }
    let hook = provider.memoizedState;
    while (hook && !hook.queue?.dispatch) hook = hook.next;
    if (!hook?.queue?.dispatch) throw new Error(`EnrollmentProvider state hook unavailable: ${JSON.stringify({ name: provider.type?.name, hooks: provider.memoizedState })}`);
    hook.queue.dispatch(flow);
  }, value);
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const locale of ['en', 'sv']) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: theme });
      await context.addInitScript((prefs) => { localStorage.setItem('locale-preference', prefs.locale); localStorage.setItem('theme-mode-preference', prefs.theme); }, { locale, theme });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('request', (r) => requests.push(r.url())); page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: catalogs[locale].onboarding.welcome.createAccount }).click();
      await page.getByLabel(catalogs[locale].onboarding.identifier.emailLabel).waitFor();
      const marker = `VISUAL_FIXTURE_${locale}_${theme}`;
      await injectFlow(page, { phase: 'otp', identifier: { valid: true, channel: 'email', identifier: marker }, challengeId: 'a'.repeat(43), cooldownUntil: 0, pending: false });
      await page.getByText('Refreshing...', { exact: true }).waitFor({ state: 'hidden', timeout: 45000 }).catch(() => undefined);
      await page.getByText(catalogs[locale].onboarding.registration.otpTitle, { exact: true }).waitFor();
      const otpName = `visual-fixture-${locale}-${theme}-otp.png`;
      await page.screenshot({ path: path.join(__dirname, otpName), fullPage: false });
      assert.equal(await page.getByLabel(catalogs[locale].onboarding.registration.otpLabel).count(), 1);
      assert.equal((await page.locator('body').innerText()).includes(marker), false);
      shots.push(otpName);
      await injectFlow(page, { phase: 'bankid', proof: `v2.${'b'.repeat(43)}` });
      await page.getByText(catalogs[locale].onboarding.registration.bankIdRequired, { exact: true }).waitFor();
      const bankidName = `visual-fixture-${locale}-${theme}-bankid.png`;
      await page.screenshot({ path: path.join(__dirname, bankidName), fullPage: false });
      assert.ok((await page.locator('body').innerText()).includes(catalogs[locale].onboarding.registration.bankIdUnavailable));
      assert.equal((await page.locator('body').innerText()).includes(`v2.${'b'.repeat(43)}`), false);
      shots.push(bankidName);
      await context.close();
    }
    assert.deepEqual(pageErrors, []);
    const external = requests.filter((url) => { const u = new URL(url); return u.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(u.hostname); });
    assert.deepEqual(external, []);
    const report = { outcome: 'PASS', mode: 'test-only React state injection; actual Expo Web routes/components; synthetic identifier/challenge/proof', viewport: { width: 375, height: 812 }, contexts: 4, screenshots: shots, requestCount: requests.length, externalRequestCount: external.length, pageErrors: pageErrors.length, limitations: ['Synthetic in-memory fixture only; no provider/API interaction, native or accessibility evidence.'] };
    fs.writeFileSync(path.join(__dirname, 'visual-fixture.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e.stack ?? e); process.exitCode = 1; });
