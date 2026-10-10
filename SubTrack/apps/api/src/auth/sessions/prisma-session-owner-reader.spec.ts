import type { PrismaClient, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaSessionOwnerReader } from './prisma-session-owner-reader';

const sub = 'opaque-owner';
const sid = 'opaque-session';
const active = {
  sessionId: sid,
  identityId: sub,
  revokedAt: null,
  ownerId: sub,
  deletedAt: null,
};
function setup(rows: unknown = [active], failAt?: number) {
  const calls: { text: string; values: unknown[] }[] = [];
  const record = (text: TemplateStringsArray, values: unknown[]) => {
    calls.push({ text: text.join('?'), values });
    if (calls.length === failAt) throw new Error('private database detail');
  };
  const tx = {
    $executeRaw: vi.fn(
      async (text: TemplateStringsArray, ...values: unknown[]) => {
        record(text, values);
        return 1;
      },
    ),
    $queryRaw: vi.fn(
      async (text: TemplateStringsArray, ...values: unknown[]) => {
        record(text, values);
        return rows;
      },
    ),
  };
  const transaction = vi.fn(
    async (op: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      op(tx as unknown as Prisma.TransactionClient),
  );
  const reader = new PrismaSessionOwnerReader({
    $transaction: transaction,
  } as unknown as Pick<PrismaClient, '$transaction'>);
  return { reader, tx, calls, transaction };
}
describe('PrismaSessionOwnerReader', () => {
  it('binds both local GUCs before one parameterized scoped join with minimal fields', async () => {
    const { reader, calls, tx, transaction } = setup();
    expect(await reader.readCurrentSessionOwner(sid, { userId: sub })).toEqual({
      session: { id: sid, identityId: sub, revokedAt: null },
      identity: { id: sub, deletedAt: null },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(calls.slice(0, 2)).toEqual([
      { text: "SELECT set_config('app.user_id', ?, true)", values: [sub] },
      {
        text: "SELECT set_config('app.current_user_id', ?, true)",
        values: [sub],
      },
    ]);
    expect(calls[2]?.values).toEqual([sid, sub]);
    expect(calls[2]?.text).toMatch(/JOIN "identity" i ON i.id = s.identity_id/);
    expect(calls[2]?.text).toMatch(
      /WHERE s.id = \?::uuid AND s.identity_id = \?::uuid/,
    );
    expect(calls[2]?.text).not.toMatch(
      /refresh|device|email|phone|\b(UPDATE|DELETE|INSERT)\b/i,
    );
  });
  it('returns null only for zero rows', async () => {
    expect(
      await setup([]).reader.readCurrentSessionOwner(sid, { userId: sub }),
    ).toBeNull();
  });
  it('preserves current committed revoked and deleted dates for the resolver', async () => {
    const date = new Date();
    const result = await setup([
      { ...active, revokedAt: date, deletedAt: date },
    ]).reader.readCurrentSessionOwner(sid, { userId: sub });
    expect(result?.session?.revokedAt).toEqual(date);
    expect(result?.identity?.deletedAt).toEqual(date);
  });
  it.each([
    null,
    {},
    [active, active],
    [null],
    [{ ...active, sessionId: 1 }],
    [{ ...active, sessionId: '' }],
    [{ ...active, identityId: 'other' }],
    [{ ...active, ownerId: 'other' }],
    [{ ...active, sessionId: 'other' }],
    [{ ...active, revokedAt: 'date' }],
    [{ ...active, deletedAt: new Date('invalid') }],
    [{ ...active, refreshTokenHash: 'forbidden' }],
    [{ sessionId: sid }],
  ])(
    'rejects malformed or inconsistent rows generically (case %#)',
    async (rows) => {
      await expect(
        setup(rows).reader.readCurrentSessionOwner(sid, { userId: sub }),
      ).rejects.toEqual(new Error('Session owner lookup failed'));
    },
  );
  it.each([1, 2, 3])(
    'normalizes setting/query errors without another lookup (case %#)',
    async (failAt) => {
      const { reader, calls } = setup([active], failAt);
      await expect(
        reader.readCurrentSessionOwner(sid, { userId: sub }),
      ).rejects.toEqual(new Error('Session owner lookup failed'));
      expect(calls).toHaveLength(failAt);
    },
  );
  it('rejects blank scope before starting a transaction', async () => {
    const { reader, transaction } = setup();
    await expect(
      reader.readCurrentSessionOwner(sid, { userId: ' ' }),
    ).rejects.toEqual(new Error('Session owner lookup failed'));
    expect(transaction).not.toHaveBeenCalled();
  });
  it('normalizes a failing context access before starting storage', async () => {
    const { reader, transaction } = setup();
    await expect(
      reader.readCurrentSessionOwner(sid, {
        get userId(): string {
          throw new Error('private context');
        },
      }),
    ).rejects.toEqual(new Error('Session owner lookup failed'));
    expect(transaction).not.toHaveBeenCalled();
  });
  it('snapshots scope before asynchronous work even if the supplied context changes', async () => {
    const { reader, tx, calls } = setup();
    const context = { userId: sub };
    tx.$executeRaw.mockImplementationOnce(async () => {
      context.userId = 'changed';
      return 1;
    });
    await reader.readCurrentSessionOwner(sid, context);
    expect(calls.at(-1)?.values).toEqual([sid, sub]);
  });
});
