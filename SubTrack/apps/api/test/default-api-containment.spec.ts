import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { appModuleFor } from '../src/app.module';
import { validateConfig } from '../src/config';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { PrismaService } from '../src/database/prisma.service';
import { PrivacyController } from '../src/privacy/privacy.controller';
import { PrivacyService } from '../src/privacy/privacy.service';
import { SetOpenBookSchema } from '../src/privacy/privacy.dto';
import { DataRightsController } from '../src/data-rights/data-rights.controller';
import { DataRightsService } from '../src/data-rights/data-rights.service';
import { DeleteAccountSchema } from '../src/data-rights/data-rights.dto';
import { JwtService } from '../src/auth/sessions/jwt.service';
import { BrowserNonceHttpController } from '../src/auth/browser-nonce/browser-nonce-http';
import { OtpHttpController } from '../src/auth/otp-v2/otp-http';
import {
  v2BrowserContextMiddleware,
  v2NoStoreMiddleware,
} from '../src/auth/http/v2-browser-context';

function send(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const encodedBody = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(encodedBody === undefined
            ? {}
            : { 'Content-Length': String(Buffer.byteLength(encodedBody)) }),
          ...headers,
        },
      },
      (response) => {
        let result = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          result += chunk;
        });
        response.on('error', reject);
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, body: result }),
        );
      },
    );
    request.on('error', reject);
    request.setTimeout(5_000, () =>
      request.destroy(new Error('Synthetic HTTP timeout')),
    );
    request.end(encodedBody);
  });
}

describe.each(['default', 'nonce', 'nonce+OTP'] as const)(
  'default legacy containment: %s graph',
  (mode) => {
    it('omits both legacy controllers/services, returns six actual HTTP 404s and preserves ops/configured v2', async () => {
      const databaseAccess = vi.fn(() => {
        throw new Error('Unexpected feature database access');
      });
      const delegates = Object.fromEntries(
        Prisma.dmmf.datamodel.models.map((model) => [
          model.name[0]!.toLowerCase() + model.name.slice(1),
          new Proxy({}, { get: () => databaseAccess }),
        ]),
      );
      const prisma = {
        ...delegates,
        $transaction: databaseAccess,
        $queryRaw: databaseAccess,
        $executeRaw: databaseAccess,
        $queryRawUnsafe: databaseAccess,
        $executeRawUnsafe: databaseAccess,
        $connect: vi.fn(async () => undefined),
        $disconnect: vi.fn(async () => undefined),
      };
      const featureCalls = [
        vi.spyOn(PrivacyService.prototype, 'getSettings'),
        vi.spyOn(PrivacyService.prototype, 'setOpenBook'),
        vi.spyOn(PrivacyService.prototype, 'previewAsHousehold'),
        vi.spyOn(DataRightsService.prototype, 'requestExport'),
        vi.spyOn(DataRightsService.prototype, 'getExportZip'),
        vi.spyOn(DataRightsService.prototype, 'deleteAccount'),
      ];
      let app: INestApplication | undefined;
      let failure: Error | undefined;
      let phase = 'module setup';
      try {
        const configured =
          mode === 'default'
            ? undefined
            : validateConfig({
                NODE_ENV: 'development',
                DATABASE_URL:
                  'postgresql://unused:synthetic@127.0.0.1:1/unused',
                AUTH_V2_ENABLED: 'true',
                AUTH_V2_BROWSER_NONCE_ENABLED: 'true',
                AUTH_V2_OTP_HTTP_ENABLED: String(mode === 'nonce+OTP'),
                AUTH_V2_IDEMPOTENCY_KEY: randomBytes(32).toString('hex'),
                AUTH_V2_BROWSER_ORIGIN_HMAC_KEY:
                  randomBytes(32).toString('hex'),
                AUTH_V2_OTP_HMAC_KEY: randomBytes(32).toString('hex'),
                AUTH_V2_RATE_LIMIT_HMAC_KEY: randomBytes(32).toString('hex'),
                AUTH_V2_ALLOWED_ORIGINS: '["http://127.0.0.1"]',
                AUTH_V2_ALLOW_LOOPBACK_HTTP: 'true',
                AUTH_V2_BINDING_COOKIE_NAME: 'st_v2_browser',
                AUTH_V2_BINDING_COOKIE_PATH: '/v2/auth',
              });
        const module = await Test.createTestingModule({
          imports: [appModuleFor(configured)],
        })
          .overrideProvider(PrismaService)
          .useValue(prisma)
          .compile();
        app = module.createNestApplication({ logger: false });
        app.use(v2NoStoreMiddleware);
        if (configured)
          app.use(
            '/v2',
            v2BrowserContextMiddleware({
              allowedOrigins: configured.AUTH_V2_ALLOWED_ORIGINS,
              bindingCookieName: configured.AUTH_V2_BINDING_COOKIE_NAME!,
              allowLoopbackHttpDevelopment:
                configured.AUTH_V2_ALLOW_LOOPBACK_HTTP,
            }),
          );
        app.useGlobalFilters(new ProblemDetailsFilter());
        phase = 'legacy controller/service absence';
        for (const token of [
          PrivacyController,
          DataRightsController,
          PrivacyService,
          DataRightsService,
        ]) {
          expect(() => module.get(token, { strict: false })).toThrow();
        }
        if (configured)
          expect(
            module.get(BrowserNonceHttpController, { strict: false }),
          ).toBeInstanceOf(BrowserNonceHttpController);
        if (mode === 'nonce+OTP')
          expect(
            module.get(OtpHttpController, { strict: false }),
          ).toBeInstanceOf(OtpHttpController);
        else
          expect(() =>
            module.get(OtpHttpController, { strict: false }),
          ).toThrow();
        phase = 'loopback listen and valid synthetic inputs';
        await app.listen(0, '127.0.0.1');
        const port = (app.getHttpServer().address() as { port: number }).port;
        const caller = randomUUID(),
          household = randomUUID();
        const openBook = { householdId: household, openBook: true };
        const deletion = { reAuthToken: 'synthetic-valid-legacy-input' };
        expect(SetOpenBookSchema.safeParse(openBook).success).toBe(true);
        expect(DeleteAccountSchema.safeParse(deletion).success).toBe(true);
        const previousPem = process.env['JWT_PRIVATE_KEY_PEM'];
        let bearer: string;
        try {
          process.env['JWT_PRIVATE_KEY_PEM'] = generateKeyPairSync('ed25519')
            .privateKey.export({ format: 'pem', type: 'pkcs8' })
            .toString();
          bearer = new JwtService().issue(caller, randomUUID());
        } finally {
          if (previousPem === undefined)
            delete process.env['JWT_PRIVATE_KEY_PEM'];
          else process.env['JWT_PRIVATE_KEY_PEM'] = previousPem;
        }
        const routes: { method: string; path: string; body?: unknown }[] = [
          { method: 'GET', path: '/v1/privacy/settings' },
          { method: 'PATCH', path: '/v1/privacy/open-book', body: openBook },
          { method: 'GET', path: `/v1/privacy/preview-as/${household}` },
          { method: 'POST', path: '/v1/data-rights/export', body: {} },
          {
            method: 'GET',
            path: `/v1/data-rights/export/${randomBytes(32).toString('hex')}`,
          },
          { method: 'DELETE', path: '/v1/data-rights/account', body: deletion },
        ];
        const credentialModes: Record<string, string>[] = [
          {},
          { 'X-Caller-Id': caller },
          { Authorization: `Bearer ${bearer}` },
          {
            'X-Caller-Id': caller,
            Authorization: `Bearer ${bearer}`,
            'X-Identity-Id': caller,
            Cookie: 'st_v2_access=synthetic; st_v2_refresh=synthetic',
          },
        ];
        phase = 'legacy HTTP 404 requests';
        for (const route of routes)
          for (const headers of credentialModes) {
            const response = await send(
              port,
              route.method,
              route.path,
              route.body,
              headers,
            );
            phase = `legacy HTTP ${route.method} status ${response.status}`;
            expect(response.status).toBe(404);
            expect(JSON.parse(response.body).title).toBe('Not Found');
            expect(databaseAccess).not.toHaveBeenCalled();
            for (const spy of featureCalls) expect(spy).not.toHaveBeenCalled();
          }
        phase = 'positive ops';
        for (const [path, status] of [
          ['/healthz', 'ok'],
          ['/readyz', 'ready'],
        ] as const) {
          const response = await send(port, 'GET', path);
          expect(response.status).toBe(200);
          expect(JSON.parse(response.body)).toEqual({ status });
        }
        const version = await send(port, 'GET', '/v1/version');
        expect(version.status).toBe(200);
        expect(typeof JSON.parse(version.body).version).toBe('string');
        if (configured) {
          phase = 'positive configured nonce';
          const nonce = await send(
            port,
            'POST',
            '/v2/auth/browser-nonce',
            { purpose: 'session' },
            {
              Origin: 'http://127.0.0.1',
              'Idempotency-Key': `containment-${randomUUID()}`,
            },
          );
          expect(nonce.status).toBe(200);
          expect(
            /^[A-Za-z0-9_-]{43}$/.test(String(JSON.parse(nonce.body).nonce)),
          ).toBe(true);
        }
        expect(databaseAccess).not.toHaveBeenCalled();
        for (const spy of featureCalls) expect(spy).not.toHaveBeenCalled();
      } catch {
        failure = new Error(
          `Default API containment proof failed: ${mode}: ${phase}`,
        );
      }
      const cleanup = await Promise.allSettled([
        Promise.resolve().then(() => app?.close()),
      ]);
      for (const spy of featureCalls) spy.mockRestore();
      if (failure) throw failure;
      if (cleanup.some((result) => result.status === 'rejected'))
        throw new Error('Default API containment cleanup failed');
    });
  },
);
