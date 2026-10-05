'use strict';

const path = require('node:path');
const { normalizeVisibleText } = require('./qa-common.cjs');

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (
      !['--base-url', '--story-id', '--selector', '--expected-text'].includes(
        key,
      ) ||
      !argv[i + 1] ||
      argv[i + 1].startsWith('--')
    ) {
      throw new Error(
        'usage: storybook-canary.cjs --base-url http://127.0.0.1:6006 --story-id component--story --selector role=button[name="Save"] [--expected-text Save]',
      );
    }
    if (values[key]) throw new Error(`duplicate option: ${key}`);
    values[key] = argv[i + 1];
  }
  for (const key of ['--base-url', '--story-id', '--selector'])
    if (!values[key]) throw new Error(`missing ${key}`);
  return {
    baseUrl: values['--base-url'],
    storyId: values['--story-id'],
    selector: values['--selector'],
    expectedText: values['--expected-text'],
  };
}

function validateOptions(options) {
  const url = new URL(options.baseUrl);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error('base URL must use HTTP on loopback');
  if (url.username || url.password)
    throw new Error('base URL must not contain credentials');
  if (!/^[\w-]+$/.test(options.storyId)) throw new Error('invalid story ID');
  const selector = options.selector;
  if (/^(\.|svg\b|css=|xpath=)/i.test(selector)) {
    throw new Error(
      'use a semantic selector; CSS classes, XPath, and SVG selectors are not accepted',
    );
  }
  if (
    !/^(role=[\w-]+(?:\[name="[^"]+"\])?|text=.+|label=.+|placeholder=.+)$/.test(
      selector,
    )
  ) {
    throw new Error(
      'selector must be role=..., text=..., label=..., or placeholder=...',
    );
  }
  return url;
}

function makeLocator(page, selector) {
  const [kind, value] = selector.split(/=(.*)/s).slice(0, 2);
  if (kind === 'role') {
    const m = value.match(/^([\w-]+)(?:\[name="([^"]+)"\])?$/);
    return page.getByRole(
      m[1],
      m[2] === undefined ? undefined : { name: m[2], exact: true },
    );
  }
  if (kind === 'text') return page.getByText(value, { exact: true });
  if (kind === 'label') return page.getByLabel(value, { exact: true });
  return page.getByPlaceholder(value, { exact: true });
}

function requireUnique(count) {
  if (count !== 1)
    throw new Error(`selector matched ${count} elements, expected exactly one`);
}

async function runCanary(options, chromium) {
  const base = validateOptions(options);
  const url = new URL('/iframe.html', base);
  url.searchParams.set('id', options.storyId);
  url.searchParams.set('viewMode', 'story');
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const response = await page.goto(url.href, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    if (!response || response.status() !== 200)
      throw new Error(
        `Storybook response was ${response ? response.status() : 'missing'}, expected 200`,
      );
    const locator = makeLocator(page, options.selector);
    const initialCount = await locator.count();
    if (initialCount > 1) requireUnique(initialCount);
    await locator.waitFor({ state: 'visible', timeout: 5000 });
    requireUnique(await locator.count());
    const fontsSettled = await page.evaluate(() => {
      let timer;
      return Promise.race([
        document.fonts.ready.then(() => true),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), 5000);
        }),
      ]).finally(() => clearTimeout(timer));
    });
    const fonts = await page.evaluate(() => ({
      status: document.fonts.status,
      count: document.fonts.size,
    }));
    if (!fontsSettled) throw new Error('fonts did not settle within 5000ms');
    if (fonts.status !== 'loaded')
      throw new Error(`fonts did not settle: ${fonts.status}`);
    const selectedText = normalizeVisibleText(await locator.innerText());
    if (
      options.expectedText !== undefined &&
      selectedText !== normalizeVisibleText(options.expectedText)
    ) {
      throw new Error(
        `selected text did not match expected text; got ${JSON.stringify(selectedText)}`,
      );
    }
    if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
    return {
      url: url.href,
      status: response.status(),
      selector: options.selector,
      selectedText,
      viewport: page.viewportSize(),
      fonts: { ...fonts, ready: true },
      browserErrors: errors,
    };
  } finally {
    await browser.close();
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const override = process.env.PLAYWRIGHT_MODULE;
  const playwrightPath =
    override ||
    path.resolve(
      __dirname,
      '../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright',
    );
  const { chromium } = require(playwrightPath);
  const report = await runCanary(options, chromium);
  process.stdout.write(
    `${JSON.stringify({ ...report, productAcceptance: false }, null, 2)}\n`,
  );
}

module.exports = {
  parseArgs,
  validateOptions,
  makeLocator,
  requireUnique,
  runCanary,
  main,
};
if (require.main === module)
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
