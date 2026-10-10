import 'reflect-metadata';
import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync, sign } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { Request } from 'express';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  AuthenticatedPrincipalGuard,
  getVerifiedPrincipal,
  getVerifiedRequestContext,
} from '../src/auth/sessions/authenticated-principal.guard';
import { JwtService } from '../src/auth/sessions/jwt.service';
import { PrincipalResolver } from '../src/auth/sessions/principal-resolver';
import type { CurrentSessionOwnerSnapshot } from '../src/auth/sessions/principal-resolver';

const owner = 'fixture-owner';
const session = 'fixture-session';
const active: CurrentSessionOwnerSnapshot = {
  session: { id: session, identityId: owner, revokedAt: null },
  identity: { id: owner, deletedAt: null },
};
let snapshot: CurrentSessionOwnerSnapshot | null;
let readerFailure = false;
const read = vi.fn(async () => {
  if (readerFailure) throw new Error('private-reader-detail');
  return snapshot;
});
const key = generateKeyPairSync('ed25519').privateKey;
let jwt: JwtService;
let app: INestApplication;
let port: number;

@Controller('probe')
class Probe {
  @Post()
  @UseGuards(AuthenticatedPrincipalGuard)
  probe(@Req() request: Request) {
    return {
      principal: getVerifiedPrincipal(request),
      context: getVerifiedRequestContext(request),
    };
  }
}

function send(
  headers: string[] = [],
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/probe?userId=spoof',
        method: 'POST',
        headers: [
          'Host',
          '127.0.0.1',
          'Content-Type',
          'application/json',
          ...headers,
        ],
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, body }),
        );
      },
    );
    request.on('error', reject);
    request.end(JSON.stringify({ identityId: 'spoof', userId: 'spoof' }));
  });
}

beforeAll(async () => {
  const previous = process.env['JWT_PRIVATE_KEY_PEM'];
  process.env['JWT_PRIVATE_KEY_PEM'] = key
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  try {
    jwt = new JwtService();
  } finally {
    if (previous === undefined) delete process.env['JWT_PRIVATE_KEY_PEM'];
    else process.env['JWT_PRIVATE_KEY_PEM'] = previous;
  }
  const guard = new AuthenticatedPrincipalGuard(
    new PrincipalResolver(jwt, { readCurrentSessionOwner: read }),
  );
  const module = await Test.createTestingModule({
    controllers: [Probe],
    providers: [{ provide: AuthenticatedPrincipalGuard, useValue: guard }],
  })
    .overrideGuard(AuthenticatedPrincipalGuard)
    .useValue(guard)
    .compile();
  app = module.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  port = (app.getHttpServer().address() as { port: number }).port;
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => {
  snapshot = structuredClone(active);
  readerFailure = false;
  read.mockClear();
});

function generic(
  response: { status: number; body: string },
  credential?: string,
): void {
  expect(response.status).toBe(401);
  expect(JSON.parse(response.body)).toEqual({
    message: 'Unauthorized',
    error: 'Unauthorized',
    statusCode: 401,
  });
  // Boolean assertions prevent credential-bearing failure output.
  for (const privateValue of [
    owner,
    session,
    'private-reader-detail',
    credential,
  ].filter((value): value is string => value !== undefined)) {
    expect(response.body.includes(privateValue)).toBe(false);
  }
}

describe('test-only existing JWT principal HTTP boundary', () => {
  it('accepts actual issued JWT and ignores spoofed caller/query/body identity', async () => {
    const token = jwt.issue(owner, session);
    const response = await send([
      'Authorization',
      `Bearer ${token}`,
      'X-Caller-Id',
      'spoof',
      'Cookie',
      'unrelated=ok',
    ]);
    expect(response.status).toBe(201);
    expect(JSON.parse(response.body)).toEqual({
      principal: { identityId: owner, sessionId: session },
      context: { userId: owner },
    });
    expect(read).toHaveBeenCalledExactlyOnceWith(session, { userId: owner });
  });

  it.each(['missing', 'duplicate', 'malformed', 'scheme', 'cookie'] as const)(
    'rejects %s transport before reader',
    async (mode) => {
      const token = jwt.issue(owner, session);
      const headers =
        mode === 'missing'
          ? ['X-Caller-Id', 'spoof']
          : mode === 'duplicate'
            ? [
                'Authorization',
                `Bearer ${token}`,
                'authorization',
                `Bearer ${token}`,
              ]
            : mode === 'malformed'
              ? ['Authorization', `Bearer ${token},extra`]
              : mode === 'scheme'
                ? ['Authorization', `Basic ${token}`]
                : [
                    'Authorization',
                    `Bearer ${token}`,
                    'Cookie',
                    'st_v2_access=',
                  ];
      generic(await send(headers), token);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('rejects correctly signed malformed claims before reader', async () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'EdDSA', crv: 'Ed25519', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: owner, sid: session, iat: 1, exp: 'invalid' }),
    ).toString('base64url');
    const message = `${header}.${payload}`;
    const token = `${message}.${sign(null, Buffer.from(message), key).toString('base64url')}`;
    generic(await send(['Authorization', `Bearer ${token}`]), token);
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects signature failure before reader', async () => {
    const other = generateKeyPairSync('ed25519').privateKey;
    const issued = jwt.issue(owner, session).split('.');
    const message = `${issued[0]}.${issued[1]}`;
    const token = `${message}.${sign(null, Buffer.from(message), other).toString('base64url')}`;
    generic(await send(['Authorization', `Bearer ${token}`]), token);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    'absent',
    'revoked',
    'deleted',
    'session mismatch',
    'owner mismatch',
    'identity mismatch',
    'reader failure',
  ] as const)('returns identical 401 for %s', async (mode) => {
    if (mode === 'absent') snapshot = null;
    else if (mode === 'revoked') snapshot!.session!.revokedAt = new Date();
    else if (mode === 'deleted') snapshot!.identity!.deletedAt = new Date();
    else if (mode === 'session mismatch') snapshot!.session!.id = 'other';
    else if (mode === 'owner mismatch') snapshot!.session!.identityId = 'other';
    else if (mode === 'identity mismatch') snapshot!.identity!.id = 'other';
    else readerFailure = true;
    const token = jwt.issue(owner, session);
    generic(await send(['Authorization', `Bearer ${token}`]), token);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('revalidates current fixture state on the next HTTP request without logging', async () => {
    const spies = ['log', 'warn', 'error', 'info', 'debug'].map((method) =>
      vi.spyOn(console, method as 'log').mockImplementation(() => undefined),
    );
    try {
      const token = jwt.issue(owner, session);
      expect((await send(['Authorization', `Bearer ${token}`])).status).toBe(
        201,
      );
      snapshot!.session!.revokedAt = new Date();
      generic(await send(['Authorization', `Bearer ${token}`]), token);
      expect(read).toHaveBeenCalledTimes(2);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
