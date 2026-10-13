import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import type { DurableCurrentWebAuthority, CurrentWebRequest, OwnerTx } from '../auth/sessions-v2/durable-current-web-authority.js';
import { canonicalPrivateSecret, exactBody, privateBody, privateCookies, privateJson, privateWire, rawHeader } from '../auth/enrollment-v2/private-enrollment-http.js';

const { parseJustMeChoice } = createRequire(__filename)('@subtrack/contracts/profile') as Readonly<{
  parseJustMeChoice(value: unknown): { mode: 'just-me' };
}>;
const { parseModeView, parsePrivateOwnerPageRequest, parsePrivateOwnerView, parsePrivateOwnerPage } =
  createRequire(__filename)('@subtrack/contracts/private-onboarding') as Readonly<{
    parseModeView(value: unknown): { mode: 'just-me' | null };
    parsePrivateOwnerPageRequest(value: unknown): { cursor?: string };
    parsePrivateOwnerView(value: unknown): OwnerView;
    parsePrivateOwnerPage(value: unknown): { items: OwnerView[]; nextCursor: string | null };
  }>;

type OwnerView = Readonly<{ visibility: 'owner'; id: string; customName: string | null; merchantId: string | null;
  merchantName: string | null; categoryCode: string; cadence: string; status: string;
  expectedAmountMinor: string; currency: string; nextChargeDate: string | null; alwaysPrivate: boolean; source: 'MANUAL' | 'DETECTED'; revision: string }>;
type ModeRow = { onboarding_mode: unknown; profile_complete: unknown };
type OwnerRow = { id: unknown; identity_id: unknown; merchant_id: unknown; merchant_name: unknown;
  source: unknown; custom_name: unknown; category_code: unknown; cadence: unknown; status: unknown;
  expected_amount_minor: unknown; currency: unknown; next_charge_date: unknown;
  always_private: unknown; revision: unknown; created_at: unknown };
type LockRow = { id: unknown; identity_id: unknown; status: unknown };
type Result = { state: 'ok'; value: object } | { state: 'missing' } | { state: 'mode-conflict' } | { state: 'lifecycle-conflict' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
const ENDPOINT = 'private-owner-subscriptions';
const ALLOWED: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ACTIVE: ['PAUSED', 'CANCELLED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'CANCELLED', 'ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
});
const title: Record<number, string> = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 409: 'Conflict', 500: 'Internal Server Error' };
function problem(response: ServerResponse, kind: 'mode' | 'subscription', status: number, code?: string): void {
  const codes: Record<number, string> = kind === 'mode'
    ? { 400: 'INVALID_MODE_REQUEST', 401: 'AUTHENTICATION_REQUIRED', 403: 'MODE_REQUEST_REJECTED',
        409: 'MODE_CONFLICT', 500: 'INTERNAL_ERROR' }
    : { 400: 'INVALID_SUBSCRIPTION_REQUEST', 401: 'AUTHENTICATION_REQUIRED',
        403: 'SUBSCRIPTION_REQUEST_REJECTED', 404: 'SUBSCRIPTION_NOT_FOUND',
        409: 'LIFECYCLE_CONFLICT', 500: 'INTERNAL_ERROR' };
  privateJson(response, status, { type: 'about:blank', title: title[status]!, status, code: code ?? codes[status]! }, true);
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
}
function position(raw?: string): { createdAt: string; id: string } | null {
  if (raw === undefined) return null;
  if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('wire');
  const bytes = Buffer.from(raw, 'base64url');
  if (bytes.length > 384 || bytes.toString('base64url') !== raw) throw new Error('wire');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('wire'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(',') !== 'createdAt,endpoint,id,v') throw new Error('wire');
  const p = parsed as Record<string, unknown>;
  if (p.v !== 1 || p.endpoint !== ENDPOINT || !timestamp(p.createdAt) ||
      typeof p.id !== 'string' || !UUID.test(p.id) ||
      Buffer.from(JSON.stringify({ v: 1, endpoint: ENDPOINT, createdAt: p.createdAt, id: p.id })).toString('base64url') !== raw)
    throw new Error('wire');
  return { createdAt: p.createdAt, id: p.id };
}
function cursor(row: OwnerRow): string {
  if (!timestamp(row.created_at) || typeof row.id !== 'string' || !UUID.test(row.id)) throw new Error('projection');
  return Buffer.from(JSON.stringify({ v: 1, endpoint: ENDPOINT, createdAt: row.created_at, id: row.id })).toString('base64url');
}
function ownerView(row: OwnerRow, ownerId: string): OwnerView {
  if (row.identity_id !== ownerId) throw new Error('projection');
  return parsePrivateOwnerView({ visibility: 'owner', source: row.source, revision: row.revision, id: row.id, customName: row.custom_name,
    merchantId: row.merchant_id, merchantName: row.merchant_name, categoryCode: row.category_code,
    cadence: row.cadence, status: row.status, expectedAmountMinor: row.expected_amount_minor,
    currency: row.currency, nextChargeDate: row.next_charge_date, alwaysPrivate: row.always_private });
}
async function readMode(tx: OwnerTx, ownerId: string): Promise<ModeRow | null> {
  const query = await tx.execute<ModeRow>('modeRead', [ownerId]);
  if (query.command !== 'SELECT' || query.rowCount !== query.rows.length || query.rows.length > 1) throw new Error('mode-query');
  const row = query.rows[0];
  if (row && typeof row.profile_complete !== 'boolean') throw new Error('mode-state');
  return row ?? null;
}
async function ready(tx: OwnerTx, ownerId: string): Promise<boolean> {
  const row = await readMode(tx, ownerId);
  return row?.profile_complete === true && row.onboarding_mode === 'just-me';
}
function route(request: IncomingMessage): { kind: 'mode' | 'subscription'; operation: 'choose' | 'mode-read' | 'list' | 'detail' | 'status'; id?: string } {
  const path = request.url;
  if (path === '/v2/me/mode' && request.method === 'POST') return { kind: 'mode', operation: 'choose' };
  if (path === '/v2/me/mode/read' && request.method === 'POST') return { kind: 'mode', operation: 'mode-read' };
  if (path === '/v2/subscriptions/owner/read' && request.method === 'POST') return { kind: 'subscription', operation: 'list' };
  const detail = /^\/v2\/subscriptions\/([^/]+)\/read$/.exec(path ?? '');
  if (detail && request.method === 'POST') return { kind: 'subscription', operation: 'detail', id: detail[1]! };
  const status = /^\/v2\/subscriptions\/([^/]+)$/.exec(path ?? '');
  if (status && request.method === 'PATCH') return { kind: 'subscription', operation: 'status', id: status[1]! };
  throw new Error('wire');
}
export function createPrivateOnboardingHttp(authority: DurableCurrentWebAuthority):
  Readonly<{ handle(request: IncomingMessage, response: ServerResponse): Promise<void> }> {
  return Object.freeze({ async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let kind: 'mode' | 'subscription' = request.url?.startsWith('/v2/me/mode') ? 'mode' : 'subscription';
    let authorityEntered = false;
    try {
      privateWire(request);
      const action = route(request); kind = action.kind;
      if (rawHeader(request, 'idempotency-key') !== null || action.id !== undefined && !UUID.test(action.id)) throw new Error('wire');
      let body: Record<string, unknown>;
      try { body = await privateBody(request); } catch { throw new Error('wire'); }
      if (action.operation === 'mode-read' || action.operation === 'detail') exactBody(body, []);
      if (action.operation === 'choose') {
        exactBody(body, ['mode']);
        try { parseJustMeChoice(body); } catch { throw new Error('wire'); }
      }
      if (action.operation === 'status') {
        exactBody(body, ['status']);
        if (typeof body.status !== 'string' || !['ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED'].includes(body.status)) throw new Error('wire');
      }
      let after: ReturnType<typeof position> = null;
      if (action.operation === 'list') {
        try { after = position(parsePrivateOwnerPageRequest(body).cursor); } catch { throw new Error('wire'); }
      }
      const origin = rawHeader(request, 'origin');
      const csrf = rawHeader(request, 'x-session-csrf');
      const cookies = privateCookies(request);
      if (origin !== 'https://localhost:3443' || !csrf || !canonicalPrivateSecret(csrf) ||
          Object.keys(cookies).length !== 3 || !Object.hasOwn(cookies, 'st_v2_access') ||
          !canonicalPrivateSecret(cookies.st_v2_binding ?? '') ||
          !canonicalPrivateSecret(cookies.st_v2_chain ?? '')) { problem(response, kind, 403); return; }
      if (!cookies.st_v2_access || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cookies.st_v2_access)) {
        problem(response, kind, 401); return;
      }
      const current: CurrentWebRequest = { accessToken: cookies.st_v2_access, exactOrigin: origin,
        bindingCookie: cookies.st_v2_binding!, browserChainId: cookies.st_v2_chain!, csrfToken: csrf };
      authorityEntered = true;
      const result: Result = await authority.withCurrentWebAuthority(current, async (tx, owner): Promise<Result> => {
        const ownerId = owner.identityId;
        if (action.operation === 'mode-read') {
          const row = await readMode(tx, ownerId);
          return row && (row.onboarding_mode === null || row.onboarding_mode === 'just-me' && row.profile_complete === true)
            ? { state: 'ok', value: parseModeView({ mode: row.onboarding_mode }) } : { state: 'mode-conflict' };
        }
        if (action.operation === 'choose') {
          const query = await tx.execute<ModeRow>('modeChoose', [ownerId, 'just-me']);
          if (query.command !== 'UPDATE' || query.rowCount !== query.rows.length || query.rows.length > 1) throw new Error('mode-write');
          if (query.rows.length === 1) {
            if (query.rows[0]?.onboarding_mode !== 'just-me') throw new Error('mode-write');
            return { state: 'ok', value: parseModeView({ mode: 'just-me' }) };
          }
          const row = await readMode(tx, ownerId);
          return row?.profile_complete === true && row.onboarding_mode === 'just-me'
            ? { state: 'ok', value: parseModeView({ mode: 'just-me' }) } : { state: 'mode-conflict' };
        }
        if (!await ready(tx, ownerId)) return { state: 'mode-conflict' };
        if (action.operation === 'list') {
          const query = await tx.execute<OwnerRow>('ownerList', [ownerId, after?.createdAt ?? null, after?.id ?? null, 'UTC', FORMAT]);
          if (query.command !== 'SELECT' || query.rowCount !== query.rows.length || query.rows.length > 51) throw new Error('list-query');
          const first = query.rows.slice(0, 50);
          const page = { items: first.map(row => ownerView(row, ownerId)),
            nextCursor: query.rows.length === 51 ? cursor(first[49]!) : null };
          return { state: 'ok', value: parsePrivateOwnerPage(page) };
        }
        if (action.operation === 'detail') {
          const query = await tx.execute<OwnerRow>('ownerDetail', [ownerId, action.id, 'UTC', FORMAT]);
          if (query.command !== 'SELECT' || query.rowCount !== query.rows.length || query.rows.length > 1) throw new Error('detail-query');
          return query.rows.length ? { state: 'ok', value: ownerView(query.rows[0]!, ownerId) } : { state: 'missing' };
        }
        const locked = await tx.execute<LockRow>('ownerStatusLock', [ownerId, action.id]);
        if (locked.command !== 'SELECT' || locked.rowCount !== locked.rows.length || locked.rows.length > 1) throw new Error('status-lock');
        const prior = locked.rows[0];
        if (!prior) return { state: 'missing' };
        if (prior.identity_id !== ownerId || prior.id !== action.id || typeof prior.status !== 'string') throw new Error('status-row');
        if (!ALLOWED[prior.status]?.includes(body.status as string)) return { state: 'lifecycle-conflict' };
        const updated = await tx.execute<LockRow>('ownerStatusCompareUpdate', [ownerId, action.id, prior.status, body.status]);
        if (updated.command !== 'UPDATE' || updated.rowCount !== 1 || updated.rows.length !== 1 ||
            updated.rows[0]?.id !== action.id || updated.rows[0]?.status !== body.status) throw new Error('status-write');
        return { state: 'ok', value: { id: action.id!, status: body.status as string } };
      });
      if (result.state === 'mode-conflict') { problem(response, kind, 409, 'MODE_CONFLICT'); return; }
      if (result.state === 'lifecycle-conflict') { problem(response, kind, 409); return; }
      if (result.state === 'missing') { problem(response, kind, 404); return; }
      privateJson(response, 200, result.value);
    } catch (error) {
      problem(response, kind, error instanceof Error && error.message === 'wire' ? 400 : authorityEntered ? 401 : 500);
    }
  } });
}
