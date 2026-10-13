import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { PRIVATE_ONBOARDING_STATEMENTS } from './private-onboarding-statements.js';
import { createPrivateOnboardingHttp } from './private-onboarding-http.js';
import type { DurableCurrentWebAuthority, OwnerTx } from '../auth/sessions-v2/durable-current-web-authority.js';

vi.mock('../auth/enrollment-v2/private-enrollment-http.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../auth/enrollment-v2/private-enrollment-http.js')>();
  return { ...actual, privateWire: () => undefined,
    privateBody: async (request: IncomingMessage) => (request as IncomingMessage & { testBody: Record<string, unknown> }).testBody,
    privateCookies: (request: IncomingMessage) => (request as IncomingMessage & { testCookies: Record<string, string> }).testCookies };
});

const OWNER = '123e4567-e89b-42d3-a456-426614174000';
const ROW = '123e4567-e89b-42d3-a456-426614174001';
const TOKEN = Buffer.alloc(32, 4).toString('base64url');
const ownerRow = (id = ROW, created_at = '2026-10-11T12:00:00.123456Z') => ({ id, identity_id: OWNER,
  source: 'MANUAL', merchant_id: null, merchant_name: null, custom_name: 'Example', category_code: 'VIDEO_STREAMING',
  cadence: 'MONTHLY', status: 'ACTIVE', expected_amount_minor: '999', currency: 'SEK',
  next_charge_date: null, always_private: false, created_at });
type Query = { command: string; rowCount: number; rows: Record<string, unknown>[] };
function query(command: string, rows: Record<string, unknown>[]): Query { return { command, rowCount: rows.length, rows }; }
function harness(operation: string, body: Record<string, unknown>, execute: (name: string, values: readonly unknown[]) => Query,
  commitFailure = false) {
  const calls: { name: string; values: readonly unknown[] }[] = [];
  let authorityCalls = 0;
  const tx = { execute: async (name: string, values: readonly unknown[]) => { calls.push({ name, values }); return execute(name, values); } } as OwnerTx;
  const authority = { withCurrentWebAuthority: async (_request: unknown, callback: (tx: OwnerTx, owner: { identityId: string }) => Promise<unknown>) => {
    authorityCalls++;
    const value = await callback(tx, { identityId: OWNER });
    if (commitFailure) throw new Error('unknown-commit');
    return value;
  } } as unknown as DurableCurrentWebAuthority;
  const method = operation.endsWith('/read') || operation === '/v2/me/mode' ? 'POST' : 'PATCH';
  const request = { url: operation, method, testBody: body,
    testCookies: { st_v2_access: 'abc.def.ghi', st_v2_binding: TOKEN, st_v2_chain: TOKEN },
    rawHeaders: ['Origin', 'https://localhost:3443', 'X-Session-CSRF', TOKEN] } as unknown as IncomingMessage;
  let status = 0; let payload: Record<string, unknown> = {};
  const response = { setHeader: () => undefined, set statusCode(value: number) { status = value; },
    end: (value: string) => { payload = JSON.parse(value) as Record<string, unknown>; } } as unknown as ServerResponse;
  return { request, response, calls, get status() { return status; }, get payload() { return payload; },
    get authorityCalls() { return authorityCalls; }, handle: () => createPrivateOnboardingHttp(authority).handle(request, response) };
}

describe('private onboarding fixed SQL registry', () => {
  it('contains only six named, quote-free, parameterized statements accepted by durable authority', () => {
    expect(Object.keys(PRIVATE_ONBOARDING_STATEMENTS)).toEqual([
      'modeRead', 'modeChoose', 'ownerList', 'ownerDetail', 'ownerStatusLock', 'ownerStatusCompareUpdate',
    ]);
    for (const sql of Object.values(PRIVATE_ONBOARDING_STATEMENTS)) {
      expect(sql).toMatch(/^(SELECT|UPDATE)\b/);
      expect(sql).toContain('$1::uuid');
      expect(sql).not.toMatch(/;|--|\/\*|\*\/|["'`]|\b(?:set_config|current_setting|commit|rollback|set_role)\b/i);
    }
  });

  it('gates the choice on persisted completeness and leaves repeated choice read-only', () => {
    expect(PRIVATE_ONBOARDING_STATEMENTS.modeChoose).toMatch(/profile_complete\s*=\s*true/);
    expect(PRIVATE_ONBOARDING_STATEMENTS.modeChoose).toMatch(/onboarding_mode\s+IS\s+NULL/);
    expect(PRIVATE_ONBOARDING_STATEMENTS.modeRead).toMatch(/onboarding_mode, profile_complete/);
  });

  it('binds owner in every subscription statement, paginates immutably and compares locked status', () => {
    for (const key of ['ownerList', 'ownerDetail', 'ownerStatusLock', 'ownerStatusCompareUpdate'] as const)
      expect(PRIVATE_ONBOARDING_STATEMENTS[key]).toMatch(/identity_id\s*=\s*\$1::uuid/);
    expect(PRIVATE_ONBOARDING_STATEMENTS.ownerList).toMatch(/\(s\.created_at, s\.id\)\s*<\s*\(\$2::timestamptz, \$3::uuid\)/);
    expect(PRIVATE_ONBOARDING_STATEMENTS.ownerList).toMatch(/ORDER BY s\.created_at DESC, s\.id DESC LIMIT 51/);
    expect(PRIVATE_ONBOARDING_STATEMENTS.ownerStatusLock).toMatch(/FOR UPDATE/);
    expect(PRIVATE_ONBOARDING_STATEMENTS.ownerStatusCompareUpdate).toMatch(/status\s*=\s*\$3::public\.subscription_status/);
    expect(PRIVATE_ONBOARDING_STATEMENTS.ownerList).not.toMatch(/confidence|detection|description|transaction|subscription_charge|bank_account/i);
  });
});

describe('private onboarding handler under controlled committed authority', () => {
  it('rejects malformed mode and owner selector before authority; incomplete choice never writes', async () => {
    const invalid = harness('/v2/me/mode', { mode: 'household' }, () => { throw new Error('unreachable'); });
    await invalid.handle(); expect(invalid.status).toBe(400); expect(invalid.authorityCalls).toBe(0);
    const selector = harness('/v2/subscriptions/owner/read', { ownerId: OWNER }, () => { throw new Error('unreachable'); });
    await selector.handle(); expect(selector.status).toBe(400); expect(selector.authorityCalls).toBe(0);
    const incomplete = harness('/v2/me/mode', { mode: 'just-me' }, name => {
      if (name === 'modeChoose') return query('UPDATE', []);
      if (name === 'modeRead') return query('SELECT', [{ onboarding_mode: null, profile_complete: false }]);
      throw new Error('unreachable');
    });
    await incomplete.handle(); expect(incomplete.status).toBe(409); expect(incomplete.calls.map(call => call.name)).toEqual(['modeChoose', 'modeRead']);
  });

  it('repeat choice is a side-effect-free committed readback, and unknown commit stays 401', async () => {
    const execute = (name: string) => name === 'modeChoose' ? query('UPDATE', [])
      : query('SELECT', [{ onboarding_mode: 'just-me', profile_complete: true }]);
    const repeat = harness('/v2/me/mode', { mode: 'just-me' }, execute);
    await repeat.handle(); expect(repeat.status).toBe(200); expect(repeat.payload).toEqual({ mode: 'just-me' });
    const uncertain = harness('/v2/me/mode', { mode: 'just-me' }, execute, true);
    await uncertain.handle(); expect(uncertain.status).toBe(401); expect(uncertain.payload.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('maps missing and disallowed status only after authority and never runs compare-update', async () => {
    const base = (name: string) => name === 'modeRead'
      ? query('SELECT', [{ onboarding_mode: 'just-me', profile_complete: true }]) : query('SELECT', []);
    const missing = harness(`/v2/subscriptions/${ROW}/read`, {}, base);
    await missing.handle(); expect(missing.status).toBe(404); expect(missing.payload.code).toBe('SUBSCRIPTION_NOT_FOUND');
    const forbidden = harness(`/v2/subscriptions/${ROW}`, { status: 'PAUSED' }, name => name === 'ownerStatusLock'
      ? query('SELECT', [{ id: ROW, identity_id: OWNER, status: 'ARCHIVED' }]) : base(name));
    await forbidden.handle(); expect(forbidden.status).toBe(409);
    expect(forbidden.calls.map(call => call.name)).toEqual(['modeRead', 'ownerStatusLock']);
  });

  it('locks and compares an allowed transition, then returns only bounded status', async () => {
    const changed = harness(`/v2/subscriptions/${ROW}`, { status: 'PAUSED' }, name => {
      if (name === 'modeRead') return query('SELECT', [{ onboarding_mode: 'just-me', profile_complete: true }]);
      if (name === 'ownerStatusLock') return query('SELECT', [{ id: ROW, identity_id: OWNER, status: 'ACTIVE' }]);
      if (name === 'ownerStatusCompareUpdate') return query('UPDATE', [{ id: ROW, status: 'PAUSED' }]);
      throw new Error('unreachable');
    });
    await changed.handle(); expect(changed.status).toBe(200); expect(changed.payload).toEqual({ id: ROW, status: 'PAUSED' });
    expect(changed.calls[2]).toEqual({ name: 'ownerStatusCompareUpdate', values: [OWNER, ROW, 'ACTIVE', 'PAUSED'] });
  });

  it('queries 51 rows and carries exact microsecond keyset position into next owner page', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ownerRow(`123e4567-e89b-42d3-a456-${String(i).padStart(12, '0')}`));
    const first = harness('/v2/subscriptions/owner/read', {}, name => name === 'modeRead'
      ? query('SELECT', [{ onboarding_mode: 'just-me', profile_complete: true }]) : query('SELECT', rows));
    await first.handle(); expect(first.status).toBe(200);
    expect((first.payload.items as unknown[]).length).toBe(50);
    expect(typeof first.payload.nextCursor).toBe('string');
    const second = harness('/v2/subscriptions/owner/read', { cursor: first.payload.nextCursor }, (name, values) => {
      if (name === 'modeRead') return query('SELECT', [{ onboarding_mode: 'just-me', profile_complete: true }]);
      expect(values.slice(0, 3)).toEqual([OWNER, '2026-10-11T12:00:00.123456Z', rows[49]!.id]);
      return query('SELECT', [ownerRow('123e4567-e89b-42d3-a456-426614174099', '2026-10-11T11:00:00.654321Z')]);
    });
    await second.handle(); expect(second.status).toBe(200); expect(second.payload.nextCursor).toBeNull();
  });
});
