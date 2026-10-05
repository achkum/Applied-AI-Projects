import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { JwtService } from './jwt.service';
import type { JwtClaims } from './jwt.service';
import {
  PrincipalResolver,
  type CurrentSessionOwnerSnapshot,
  type SessionOwnerReader,
} from './principal-resolver';

const sub = 'identity-1';
const sid = 'session-1';
const active: CurrentSessionOwnerSnapshot = {
  session: { id: sid, identityId: sub, revokedAt: null },
  identity: { id: sub, deletedAt: null },
};

function setup(
  snapshot: CurrentSessionOwnerSnapshot | null = active,
  verify: (token: string) => JwtClaims = () => ({ sub, sid, iat: 1, exp: 2 }),
) {
  const calls: unknown[][] = [];
  const reader: SessionOwnerReader = {
    readCurrentSessionOwner: async (...args) => {
      calls.push(args);
      return snapshot;
    },
  };
  const resolver = new PrincipalResolver({ verify }, reader);
  return { resolver, calls };
}

describe('PrincipalResolver', () => {
  it('verifies before one scoped read and returns a frozen copy', async () => {
    const events: string[] = [];
    const snapshot = structuredClone(active);
    const reader: SessionOwnerReader = {
      readCurrentSessionOwner: async (sessionId, context) => {
        events.push('read');
        expect(sessionId).toBe(sid);
        expect(context).toEqual({ userId: sub });
        expect(Object.isFrozen(context)).toBe(true);
        return snapshot;
      },
    };
    const resolver = new PrincipalResolver(
      {
        verify: (token) => {
          events.push(`verify:${token}`);
          return { sub, sid, iat: 1, exp: 2 };
        },
      },
      reader,
    );
    const principal = await resolver.resolve('opaque-token');
    expect(events).toEqual(['verify:opaque-token', 'read']);
    expect(principal).toEqual({ identityId: sub, sessionId: sid });
    expect(Object.isFrozen(principal)).toBe(true);
    expect(principal).not.toBe(snapshot);
    snapshot.identity!.id = 'changed';
    expect(principal.identityId).toBe(sub);
  });

  it('never reads when JWT verification fails and normalizes the error', async () => {
    const { resolver, calls } = setup(active, () => {
      throw new Error('private verifier detail');
    });
    await expect(resolver.resolve('bad')).rejects.toEqual(
      new UnauthorizedException('Unauthorized'),
    );
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['missing snapshot', null],
    ['missing session', { ...active, session: null }],
    ['missing identity', { ...active, identity: null }],
    [
      'session id mismatch',
      { ...active, session: { ...active.session!, id: 'other' } },
    ],
    [
      'session owner mismatch',
      { ...active, session: { ...active.session!, identityId: 'other' } },
    ],
    [
      'revoked session',
      { ...active, session: { ...active.session!, revokedAt: new Date() } },
    ],
    [
      'identity id mismatch',
      { ...active, identity: { ...active.identity!, id: 'other' } },
    ],
    [
      'deleted identity',
      { ...active, identity: { ...active.identity!, deletedAt: new Date() } },
    ],
  ] as const)(
    'rejects %s with the same generic failure',
    async (_label, snapshot) => {
      const { resolver, calls } = setup(snapshot);
      await expect(resolver.resolve('token')).rejects.toEqual(
        new UnauthorizedException('Unauthorized'),
      );
      expect(calls).toHaveLength(1);
    },
  );

  it('normalizes reader failures without preserving causes', async () => {
    const resolver = new PrincipalResolver(
      { verify: () => ({ sub, sid, iat: 1, exp: 2 }) },
      {
        readCurrentSessionOwner: async () => {
          throw new Error('private lookup detail');
        },
      },
    );
    let failure: unknown;
    try {
      await resolver.resolve('token');
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(UnauthorizedException);
    if (!(failure instanceof UnauthorizedException))
      throw new Error('Expected unauthorized failure');
    expect(failure.getResponse()).toEqual({
      error: 'Unauthorized',
      message: 'Unauthorized',
      statusCode: 401,
    });
    expect(failure.message).toBe('Unauthorized');
    expect('cause' in failure ? failure.cause : undefined).toBeUndefined();
  });

  it('reads current state again and rejects a session revoked after the first resolution', async () => {
    let snapshot: CurrentSessionOwnerSnapshot = structuredClone(active);
    const resolver = new PrincipalResolver(
      { verify: () => ({ sub, sid, iat: 1, exp: 2 }) },
      {
        readCurrentSessionOwner: async () => snapshot,
      },
    );
    await expect(resolver.resolve('token')).resolves.toEqual({
      identityId: sub,
      sessionId: sid,
    });
    snapshot = {
      ...snapshot,
      session: { ...snapshot.session!, revokedAt: new Date() },
    };
    await expect(resolver.resolve('token')).rejects.toEqual(
      new UnauthorizedException('Unauthorized'),
    );
  });

  it('resolves a token issued and verified by the existing JwtService', async () => {
    const previous = process.env['JWT_PRIVATE_KEY_PEM'];
    const { privateKey } = generateKeyPairSync('ed25519');
    process.env['JWT_PRIVATE_KEY_PEM'] = privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    try {
      const jwt = new JwtService();
      const resolver = new PrincipalResolver(jwt, {
        readCurrentSessionOwner: async (sessionId, context) => {
          expect(sessionId).toBe(sid);
          expect(context).toEqual({ userId: sub });
          return active;
        },
      });
      await expect(resolver.resolve(jwt.issue(sub, sid))).resolves.toEqual({
        identityId: sub,
        sessionId: sid,
      });
    } finally {
      if (previous === undefined) delete process.env['JWT_PRIVATE_KEY_PEM'];
      else process.env['JWT_PRIVATE_KEY_PEM'] = previous;
    }
  });
});
