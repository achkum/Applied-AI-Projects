// ST-237 feasibility only: a real Nest/Express route and a real Next page share one TLS listener.
import fs from 'node:fs';
import https from 'node:https';
import console from 'node:console';
import process from 'node:process';
import { TLSSocket } from 'node:tls';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = path.resolve(webDir, '../..');
const webRequire = createRequire(path.join(webDir, 'package.json'));
const apiRequire = createRequire(path.join(repoDir, 'apps/api/package.json'));
const origin = 'https://localhost:3443';
let browserPhase = 'LAUNCH';
let browserObserved = 'NONE';

function browserErrorClass(error) {
  const detail = String(error);
  for (const code of [
    'SSL_ERROR_BAD_CERT_DOMAIN',
    'SEC_ERROR_UNKNOWN_ISSUER',
    'MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT',
    'SEC_ERROR_EXPIRED_CERTIFICATE',
    'NS_ERROR_FAILURE',
    'NS_ERROR_NET_RESET',
    'NS_ERROR_NET_INTERRUPT',
    'NS_ERROR_UNKNOWN_HOST',
    'SEC_ERROR_CA_CERT_INVALID',
    'SSL_ERROR_RX_RECORD_TOO_LONG',
  ]) {
    if (new RegExp(`(?:^|[^A-Z0-9_])${code}(?:$|[^A-Z0-9_])`).test(detail)) return code;
  }
  if (/(?:ERR_CONNECTION_REFUSED|NS_ERROR_CONNECTION_REFUSED|ECONNREFUSED)/.test(detail)) return 'CONNECTION_REFUSED';
  if (/(?:Timeout|timed out)/.test(detail)) return 'TIMEOUT';
  if (/(?:Target page, context or browser has been closed|BrowserContext\.newPage: Target closed|Page\.goto: Target closed)/.test(detail)) return 'BROWSER_CONTEXT_CLOSED';
  if (browserPhase === 'LAUNCH' || browserPhase === 'UNTRUSTED_LAUNCH' ||
      /(?:Failed to launch|browserType\.launchPersistentContext)/.test(detail)) return 'LAUNCH_FAILED';
  if (detail === 'Error: real Next register page did not load') return 'NEXT_PAGE_ASSERT';
  if (detail === 'Error: real Nest POST failed') return 'NEST_POST_ASSERT';
  if (detail === 'Error: Nest did not see direct browser TLS/Origin') return 'NEST_AUTHORITY_ASSERT';
  if (detail === 'Error: expected Firefox TLS rejection was not observed') return 'TLS_NEGATIVE_ASSERT';
  return 'OTHER';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function server() {
  apiRequire('reflect-metadata');
  const { NestFactory } = apiRequire('@nestjs/core');
  const { ExpressAdapter } = apiRequire('@nestjs/platform-express');
  const { Controller, Module, Post, Req } = apiRequire('@nestjs/common');
  const express = createRequire(apiRequire.resolve('@nestjs/platform-express'))('express');
  const next = webRequire('next');

  class ProofController {
    post(req) {
      const hosts = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host');
      const origins = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'origin');
      assert(req.socket instanceof TLSSocket && req.socket.encrypted, 'Nest lost the original TLS socket');
      assert(req.socket.remoteAddress === '127.0.0.1', 'non-loopback peer');
      assert(hosts.length === 1 && origins.length === 1, 'ambiguous raw browser headers');
      assert(req.headers.host === 'localhost:3443' && req.headers.origin === origin, 'wrong browser authority');
      return { tlsSocket: true, rawHeaders: true, browserOrigin: true };
    }
  }
  Controller('v2')(ProofController);
  Post('tls-preflight')(ProofController.prototype, 'post', Object.getOwnPropertyDescriptor(ProofController.prototype, 'post'));
  Req()(ProofController.prototype, 'post', 0);
  class ProofModule {}
  Module({ controllers: [ProofController] })(ProofModule);

  const apiHandler = express();
  const nest = await NestFactory.create(ProofModule, new ExpressAdapter(apiHandler), { logger: false });
  await nest.init();
  const nextApp = next({ dev: false, dir: webDir, hostname: 'localhost', port: 3443 });
  await nextApp.prepare();
  const nextHandler = nextApp.getRequestHandler();
  const tlsServer = https.createServer({
    key: fs.readFileSync(process.env.ST237_LEAF_KEY),
    cert: fs.readFileSync(process.env.ST237_LEAF_CHAIN),
  }, (req, res) => {
    // This gate runs before either framework sees the request; no proxy rewrites authority.
    if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== 'localhost:3443') {
      res.writeHead(421).end();
      return;
    }
    if (req.url === '/v2/tls-preflight') apiHandler(req, res);
    else if (req.url?.startsWith('/v2/')) res.writeHead(404).end();
    else Promise.resolve(nextHandler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500).end(); });
  });
  tlsServer.listen(3443, '127.0.0.1', () => console.log('ST237_TLS_SERVER_READY'));
  async function close() {
    tlsServer.close();
    tlsServer.closeAllConnections();
    await nest.close();
    await nextApp.close();
  }
  process.once('SIGTERM', () => { void close().finally(() => process.exit(0)); });
  process.once('SIGINT', () => { void close().finally(() => process.exit(0)); });
}

async function browser() {
  browserPhase = 'LAUNCH';
  const { firefox } = webRequire('playwright');
  assert(webRequire('playwright/package.json').version === '1.63.0', 'unexpected Playwright version');
  const profile = process.env.ST237_TRUSTED_PROFILE;
  const cleanProfile = process.env.ST237_CLEAN_PROFILE;
  assert(profile && cleanProfile && profile !== cleanProfile, 'two owned Firefox profiles required');
  const trusted = await firefox.launchPersistentContext(profile, { headless: true });
  try {
    async function healthy() {
      browserPhase = 'TRUSTED_PAGE';
      browserObserved = 'NONE';
      const page = await trusted.newPage();
      try {
        browserPhase = 'TRUSTED_NAVIGATE';
        const response = await page.goto(`${origin}/sv/register`, { waitUntil: 'domcontentloaded' });
        browserPhase = 'TRUSTED_RESPONSE';
        const status = response?.status();
        browserObserved = Number.isInteger(status) && status >= 100 && status <= 599
          ? `HTTP_${status}` : 'NO_RESPONSE';
        assert(response?.status() === 200, 'real Next register page did not load');
        browserObserved = 'NONE';
        browserPhase = 'TRUSTED_POST';
        const result = await page.evaluate(async () => {
          const response = await globalThis.fetch('/v2/tls-preflight', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
          });
          return { status: response.status, body: await response.json() };
        });
        assert(result.status === 201, 'real Nest POST failed');
        assert(result.body?.tlsSocket === true && result.body?.rawHeaders === true && result.body?.browserOrigin === true,
          'Nest did not see direct browser TLS/Origin');
      } finally { await page.close(); }
    }
    await healthy();
    console.log('PASS ST237_TRUSTED_LOCALHOST_NEXT_NEST_TLS');
    async function expectTlsFailure(context, url, code, phase) {
      browserPhase = phase;
      browserObserved = 'NONE';
      const page = await context.newPage();
      try {
        let rejected = false;
        try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
        catch (error) {
          // Inspect only the expected Firefox TLS code. Never export raw browser errors.
          browserObserved = browserErrorClass(error);
          rejected = new RegExp(`(?:^|[^A-Z0-9_])${code}(?:$|[^A-Z0-9_])`).test(String(error));
        }
        assert(rejected, 'expected Firefox TLS rejection was not observed');
        browserObserved = 'NONE';
      } finally { await page.close(); }
    }
    await expectTlsFailure(trusted, 'https://127.0.0.1:3443/sv/register', 'SSL_ERROR_BAD_CERT_DOMAIN', 'WRONG_HOST');
    await healthy();
    console.log('PASS ST237_WRONG_HOSTNAME_REJECTED');
    browserPhase = 'UNTRUSTED_LAUNCH';
    const untrusted = await firefox.launchPersistentContext(cleanProfile, { headless: true });
    try {
      await expectTlsFailure(untrusted, `${origin}/sv/register`, 'SEC_ERROR_UNKNOWN_ISSUER', 'UNTRUSTED_NAVIGATE');
    } finally { await untrusted.close(); }
    await healthy();
    console.log('PASS ST237_UNTRUSTED_CA_REJECTED');
  } finally { await trusted.close(); }
}

const mode = process.argv[2];
if (mode === 'server') await server();
else if (mode === 'browser') {
  try { await browser(); }
  catch (error) {
    const classification = browserObserved === 'NONE' ? browserErrorClass(error) : browserObserved;
    console.log(`DIAG ST237_BROWSER phase=${browserPhase} class=${classification}`);
    process.exitCode = 1;
  }
}
else throw new Error('expected server or browser mode');
