import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthenticatedPrincipalGuard,
  getVerifiedPrincipal,
  getVerifiedRequestContext,
} from './authenticated-principal.guard';

const principal = { identityId: 'fixture-owner', sessionId: 'fixture-session' };
function execution(request: object, type = 'http'): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
function setup(
  rawHeaders: unknown = ['Authorization', 'Bearer fixture-token'],
) {
  const request = {
    rawHeaders,
    headers: { authorization: 'Bearer normalized' },
    body: { identityId: 'spoof' },
    query: { userId: 'spoof' },
  };
  const resolve = vi.fn(async () => principal);
  return {
    request,
    resolve,
    guard: new AuthenticatedPrincipalGuard({ resolve }),
  };
}

describe('AuthenticatedPrincipalGuard', () => {
  it.each(['Bearer fixture-token', ' \tbEaReR  \tfixture-token\t '])(
    'accepts defined bearer grammar',
    async (value) => {
      const { request, resolve, guard } = setup([
        'aUtHoRiZaTiOn',
        value,
        'X-Caller-Id',
        'spoof',
        'Cookie',
        'unrelated=st_v2_access; ST_v2_access=other; prefix_st_v2_refresh=x',
      ]);
      await expect(guard.canActivate(execution(request))).resolves.toBe(true);
      expect(resolve).toHaveBeenCalledExactlyOnceWith('fixture-token');
      const verified = getVerifiedPrincipal(request);
      expect(verified).toEqual(principal);
      expect(verified).not.toBe(principal);
      expect(Object.isFrozen(verified)).toBe(true);
      expect(getVerifiedRequestContext(request)).toEqual({
        userId: principal.identityId,
      });
      expect(Object.isFrozen(getVerifiedRequestContext(request))).toBe(true);
      expect(JSON.stringify(request)).not.toContain(principal.identityId);
      expect(Object.keys(request)).toEqual([
        'rawHeaders',
        'headers',
        'body',
        'query',
      ]);
      for (const symbol of Object.getOwnPropertySymbols(request)) {
        expect(Object.getOwnPropertyDescriptor(request, symbol)).toMatchObject({
          enumerable: false,
          writable: false,
          configurable: true,
        });
      }
    },
  );

  const invalid: unknown[] = [
    undefined,
    null,
    {},
    [],
    ['Authorization'],
    ['Authorization', 1],
    [1, 'x'],
    [new String('Authorization'), 'x'],
    [
      'Authorization',
      'Bearer fixture-token',
      'authorization',
      'Bearer fixture-token',
    ],
    ['Authorization', '', 'Authorization', 'Bearer fixture-token'],
    ...[
      '',
      'Basic fixture-token',
      'Bearer',
      'Bearer\tfixture-token',
      'Bearer token,other',
      'Bearer token other',
      'Bearer token\n',
      'Bearer token\r',
      '\nBearer token',
      'Bearer\u00a0token',
      'Bearer token\v',
    ].map((value) => ['Authorization', value]),
    ...[
      'st_v2_access=',
      'st_v2_refresh=""',
      'other=x; st_v2_access=token',
      'st_v2_refresh',
      '\tst_v2_access =x',
    ].map((value) => [
      'Authorization',
      'Bearer fixture-token',
      'Cookie',
      'other=x',
      'cOoKiE',
      value,
    ]),
  ];
  it.each(invalid.map((headers, index) => [index, headers] as const))(
    'rejects raw transport case %i before resolving',
    async (_index, headers) => {
      const { request, resolve, guard } = setup(headers);
      request.rawHeaders = headers;
      await expect(guard.canActivate(execution(request))).rejects.toEqual(
        new UnauthorizedException('Unauthorized'),
      );
      expect(resolve).not.toHaveBeenCalled();
      expect(() => getVerifiedPrincipal(request)).toThrow('Unauthorized');
      expect(() => getVerifiedRequestContext(request)).toThrow('Unauthorized');
    },
  );

  it('requires HTTP context and masks request acquisition failures', async () => {
    const { request, guard, resolve } = setup();
    await expect(guard.canActivate(execution(request, 'rpc'))).rejects.toEqual(
      new UnauthorizedException('Unauthorized'),
    );
    await expect(
      guard.canActivate({
        getType: () => 'http',
        switchToHttp: () => {
          throw new Error('private');
        },
      } as unknown as ExecutionContext),
    ).rejects.toEqual(new UnauthorizedException('Unauthorized'));
    expect(resolve).not.toHaveBeenCalled();
  });

  it('revalidates every time, clears before await, and clears stale authority on failure', async () => {
    const { request, guard, resolve } = setup();
    await guard.canActivate(execution(request));
    const first = getVerifiedPrincipal(request);
    const firstContext = getVerifiedRequestContext(request);
    resolve.mockImplementationOnce(async () => {
      expect(() => getVerifiedPrincipal(request)).toThrow('Unauthorized');
      expect(() => getVerifiedRequestContext(request)).toThrow('Unauthorized');
      return principal;
    });
    await guard.canActivate(execution(request));
    expect(getVerifiedPrincipal(request)).not.toBe(first);
    expect(getVerifiedRequestContext(request)).not.toBe(firstContext);
    resolve.mockRejectedValueOnce(new Error('private reader detail'));
    await expect(guard.canActivate(execution(request))).rejects.toEqual(
      new UnauthorizedException('Unauthorized'),
    );
    expect(() => getVerifiedPrincipal(request)).toThrow('Unauthorized');
    expect(() => getVerifiedRequestContext(request)).toThrow('Unauthorized');
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('clears a successful attachment when repeated parsing fails', async () => {
    const { request, guard } = setup();
    await guard.canActivate(execution(request));
    request.rawHeaders = [];
    await expect(guard.canActivate(execution(request))).rejects.toThrow(
      'Unauthorized',
    );
    expect(Object.getOwnPropertySymbols(request)).toHaveLength(0);
  });

  it('retrieval rejects absent and inherited attachments', async () => {
    const { request, guard } = setup();
    await guard.canActivate(execution(request));
    for (const value of [
      {},
      Object.create(request) as object,
      null as unknown as object,
    ]) {
      expect(() => getVerifiedPrincipal(value)).toThrow('Unauthorized');
      expect(() => getVerifiedRequestContext(value)).toThrow('Unauthorized');
    }
  });

  it('cleans partial attachment failure and masks damaged cleanup', async () => {
    const { request, resolve, guard } = setup();
    let definitions = 0;
    const proxy = new Proxy(request, {
      defineProperty(target, key, descriptor) {
        definitions++;
        if (definitions === 2) throw new Error('private attachment failure');
        return Reflect.defineProperty(target, key, descriptor);
      },
    });
    await expect(guard.canActivate(execution(proxy))).rejects.toThrow(
      'Unauthorized',
    );
    expect(Object.getOwnPropertySymbols(request)).toHaveLength(0);
    const damaged = new Proxy(request, { deleteProperty: () => false });
    await expect(guard.canActivate(execution(damaged))).rejects.toThrow(
      'Unauthorized',
    );
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('does not log transport or resolver failures', async () => {
    const spies = ['log', 'warn', 'error', 'info', 'debug'].map((method) =>
      vi.spyOn(console, method as 'log').mockImplementation(() => undefined),
    );
    try {
      const { request, guard, resolve } = setup();
      resolve.mockRejectedValueOnce(new Error('private'));
      await expect(guard.canActivate(execution(request))).rejects.toThrow(
        'Unauthorized',
      );
      request.rawHeaders = [];
      await expect(guard.canActivate(execution(request))).rejects.toThrow(
        'Unauthorized',
      );
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
