import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/problem-details.filter';
import { PrismaService } from '../src/database/prisma.service';
import { validateConfig } from '../src/config';
import { withRequestTransaction } from '../src/database/request-transaction';
import request from 'supertest';
import { httpLoggerOptions } from '../src/common/http-logger';
import pino from 'pino';

const transaction = { $executeRaw: async () => 1 };
const prismaStub = {
  $connect: async () => undefined,
  $disconnect: async () => undefined,
  $transaction: async <T>(callback: (tx: typeof transaction) => Promise<T>) =>
    callback(transaction),
};

describe('API foundation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://api:local@localhost:5432/subtrack';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterAll(async () => app?.close());

  it('serves the three contracted operational responses', async () => {
    for (const [path, body] of [
      ['/healthz', { status: 'ok' }],
      ['/readyz', { status: 'ready' }],
      ['/v1/version', { version: '0.0.0' }],
    ] as const) {
      await request(app.getHttpServer()).get(path).expect(200, body);
    }
  });

  it('maps unknown errors to safe problem details', async () => {
    let sent: unknown;
    let statusCode: number | undefined;
    let contentType: string | undefined;
    const response = {
      status: (status: number) => {
        statusCode = status;
        return response;
      },
      type: (type: string) => {
        contentType = type;
        return response;
      },
      send: (body: unknown) => {
        sent = body;
        return response;
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({
          path: '/failure',
          headers: { authorization: 'credential-should-not-leak' },
        }),
      }),
    } as never;
    const filter = new ProblemDetailsFilter();
    filter.catch(new Error('private stack and secret'), host);
    expect(statusCode).toBe(500);
    expect(contentType).toBe('application/problem+json');
    expect(sent).toMatchObject({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      instance: '/failure',
    });
    expect(JSON.stringify(sent)).not.toContain('private');
    expect(JSON.stringify(sent)).not.toContain('credential-should-not-leak');
  });

  it('rejects missing or malformed required configuration without echoing values', () => {
    expect(() => validateConfig({})).toThrow(/DATABASE_URL/);
    try {
      validateConfig({ DATABASE_URL: 'sensitive-not-a-url' });
    } catch (error) {
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).not.toContain('sensitive');
    }
  });

  it('emits a privacy-minimized structured request record', () => {
    const serialize = httpLoggerOptions.serializers?.req;
    expect(typeof serialize).toBe('function');
    const record = (serialize as (request: never) => unknown)({
      id: 'request-id',
      method: 'GET',
      route: { path: '/healthz' },
      headers: { authorization: 'bearer secret', cookie: 'private' },
      raw: {
        url: '/healthz?token=secret',
        route: { path: '/healthz' },
        socket: { remoteAddress: '198.51.100.2' },
      },
      body: { personalNumber: 'private' },
    } as never);
    expect(record).toEqual({
      id: 'request-id',
      method: 'GET',
      route: '/healthz',
    });
    expect(JSON.stringify(record)).not.toContain('credential-should-not-leak');
    expect(JSON.stringify(record)).not.toContain('private');

    const output: string[] = [];
    const logger = pino(
      {
        serializers: httpLoggerOptions.serializers ?? {},
        redact: httpLoggerOptions.redact ?? [],
      },
      {
        write: (line: string) => output.push(line),
      },
    );
    logger.info(
      {
        req: {
          id: 'request-id',
          method: 'GET',
          route: { path: '/healthz' },
          headers: {
            authorization: 'credential-should-not-leak',
            cookie: 'private-cookie',
          },
          raw: { url: '/healthz?token=query-secret' },
          body: { personalNumber: 'personal-data' },
        },
      },
      'request complete',
    );
    const structuredRecord = JSON.parse(output[0]!) as {
      level: number;
      msg: string;
      req: unknown;
    };
    expect(structuredRecord.level).toBe(30);
    expect(structuredRecord.msg).toBe('request complete');
    expect(JSON.stringify(structuredRecord)).not.toContain(
      'credential-should-not-leak',
    );
    expect(JSON.stringify(structuredRecord)).not.toContain('private-cookie');
    expect(JSON.stringify(structuredRecord)).not.toContain('query-secret');
    expect(JSON.stringify(structuredRecord)).not.toContain('personal-data');
  });

  it('sets each user identity transaction-locally before running operations', async () => {
    const events: string[] = [];
    const runner = {
      $transaction: async <T>(
        callback: (tx: typeof transaction) => Promise<T>,
      ) => callback(transaction),
    };
    const tx = {
      $executeRaw: async (query: TemplateStringsArray, userId: string) => {
        const statement = query.join('?');
        const setting = statement.includes("set_config('app.user_id', ?")
          ? 'app.user_id'
          : 'app.current_user_id';
        expect(statement).toContain(`set_config('${setting}', ?`);
        expect(statement).toContain(', true)');
        expect(statement).not.toContain(userId);
        events.push(`set:${setting}:${userId}`);
        return 1;
      },
    };
    const actualRunner = {
      $transaction: runner.$transaction as typeof runner.$transaction,
    };
    // Use a mock client preserving the tagged-template call to inspect transaction order.
    actualRunner.$transaction = async <T>(
      callback: (client: typeof transaction) => Promise<T>,
    ) => callback(tx as typeof transaction);
    await withRequestTransaction(
      actualRunner as never,
      { userId: 'user-a' },
      async () => {
        events.push('query:user-a');
        return 'a';
      },
    );
    await withRequestTransaction(
      actualRunner as never,
      { userId: 'user-b' },
      async () => {
        events.push('query:user-b');
        return 'b';
      },
    );
    expect(events).toEqual([
      'set:app.user_id:user-a',
      'set:app.current_user_id:user-a',
      'query:user-a',
      'set:app.user_id:user-b',
      'set:app.current_user_id:user-b',
      'query:user-b',
    ]);
  });

  it.each(['app.user_id', 'app.current_user_id'] as const)(
    'does not invoke the operation when setting %s fails',
    async (failedSetting) => {
      const attempts: string[] = [];
      let operationCalled = false;
      const tx = {
        $executeRaw: async (query: TemplateStringsArray) => {
          const statement = query.join('?');
          attempts.push(statement);
          if (statement.includes(`set_config('${failedSetting}', ?`)) {
            throw new Error(`failed ${failedSetting}`);
          }
          return 1;
        },
      };
      const runner = {
        $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) =>
          callback(tx as typeof transaction),
      };

      await expect(
        withRequestTransaction(runner as never, { userId: 'user-a' }, async () => {
          operationCalled = true;
        }),
      ).rejects.toThrow(`failed ${failedSetting}`);
      expect(operationCalled).toBe(false);
      expect(attempts).toHaveLength(failedSetting === 'app.user_id' ? 1 : 2);
    },
  );

  it('uses one captured identity even if the caller mutates its context during binding', async () => {
    const context = { userId: 'user-original' };
    const settingValues: string[] = [];
    let operationCalled = false;
    const tx = {
      $executeRaw: async (query: TemplateStringsArray, userId: string) => {
        settingValues.push(userId);
        if (settingValues.length === 1) context.userId = 'user-mutated';
        expect(query.join('?')).toContain(', true)');
        return 1;
      },
    };
    const runner = {
      $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) =>
        callback(tx as typeof transaction),
    };

    await withRequestTransaction(runner as never, context, async () => {
      operationCalled = true;
    });

    expect(context.userId).toBe('user-mutated');
    expect(settingValues).toEqual(['user-original', 'user-original']);
    expect(operationCalled).toBe(true);
  });

  it('rejects blank request identity before opening a transaction', async () => {
    let transactionStarted = false;
    const runner = {
      $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => {
        transactionStarted = true;
        return callback(transaction);
      },
    };

    await expect(
      withRequestTransaction(runner as never, { userId: '  \t  ' }, async () => 'unreachable'),
    ).rejects.toThrow('Authenticated request context is required');
    expect(transactionStarted).toBe(false);
  });

  it('closes the transaction when the request operation fails', async () => {
    let closed = false;
    const runner = {
      $transaction: async <T>(
        callback: (tx: typeof transaction) => Promise<T>,
      ) => {
        try {
          return await callback(transaction);
        } finally {
          closed = true;
        }
      },
    };
    await expect(
      withRequestTransaction(
        runner as never,
        { userId: 'user-a' },
        async () => {
          throw new Error('failure');
        },
      ),
    ).rejects.toThrow('failure');
    expect(closed).toBe(true);
  });
});
