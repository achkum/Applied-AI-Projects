import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import type { DurableCurrentWebAuthority, CurrentWebRequest } from '../auth/sessions-v2/durable-current-web-authority.js';
import { canonicalPrivateSecret, exactBody, privateBody, privateCookies, privateJson, privateWire, rawHeader } from '../auth/enrollment-v2/private-enrollment-http.js';

// The accepted contracts export is runtime TypeScript in this workspace; load it through Node's
// supported type-stripping path without compiling that separate package under the API emit config.
const { parseProfilePatch, parseProfileView } = createRequire(__filename)('@subtrack/contracts/profile') as Readonly<{
  parseProfilePatch(value: unknown): Readonly<Record<string, unknown>>;
  parseProfileView(value: unknown): Readonly<Record<string, unknown>>;
}>;

const P: Record<number, Readonly<{ type: 'about:blank'; title: string; status: number; code: string }>> = {
  400: { type: 'about:blank', title: 'Bad Request', status: 400, code: 'INVALID_PROFILE_REQUEST' },
  401: { type: 'about:blank', title: 'Unauthorized', status: 401, code: 'AUTHENTICATION_REQUIRED' },
  403: { type: 'about:blank', title: 'Forbidden', status: 403, code: 'PROFILE_REQUEST_REJECTED' },
  409: { type: 'about:blank', title: 'Conflict', status: 409, code: 'PROFILE_CONFLICT' },
  500: { type: 'about:blank', title: 'Internal Server Error', status: 500, code: 'INTERNAL_ERROR' },
};
const problem = (response: ServerResponse, status: number) => privateJson(response, status, P[status] ?? P[500]!, true);
const FIELDS = ['displayName', 'avatarColourToken', 'avatarEmoji', 'language', 'theme'] as const;
type Row = { display_name: unknown; avatar_color: unknown; avatar_emoji: unknown; language: unknown;
  theme: unknown; default_currency: unknown; profile_complete: unknown };
function patch(body: Record<string, unknown>): unknown[] {
  let parsed: ReturnType<typeof parseProfilePatch>;
  try { parsed = parseProfilePatch(body); } catch { throw new Error('wire'); }
  return FIELDS.flatMap(field => [Object.hasOwn(parsed, field), parsed[field] ?? null]);
}
function view(row: Row | undefined): object {
  if (!row || row.profile_complete !== (row.display_name !== null)) throw new Error('profile-state');
  return Object.freeze(parseProfileView({ displayName: row.display_name, avatarColourToken: row.avatar_color,
    avatarEmoji: row.avatar_emoji, language: row.language, theme: row.theme,
    defaultCurrency: row.default_currency, profileComplete: row.profile_complete }));
}
export function createPrivateProfileHttp(authority: DurableCurrentWebAuthority):
  Readonly<{ handle(request: IncomingMessage, response: ServerResponse): Promise<void> }> {
  return Object.freeze({ async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      privateWire(request);
      const path = request.url;
      if (path !== '/v2/me/profile/read' && path !== '/v2/me/profile') { problem(response, 400); return; }
      if (path === '/v2/me/profile/read' && request.method !== 'POST' ||
        path === '/v2/me/profile' && request.method !== 'PATCH' ||
        rawHeader(request, 'idempotency-key') !== null) throw new Error('wire');
      let body: Record<string, unknown>;
      try { body = await privateBody(request); } catch { throw new Error('wire'); }
      if (path.endsWith('/read')) exactBody(body, []);
      const values = path.endsWith('/read') ? [] : patch(body);
      const origin = rawHeader(request, 'origin');
      const csrf = rawHeader(request, 'x-session-csrf');
      const cookies = privateCookies(request);
      if (origin !== 'https://localhost:3443' || !csrf || !canonicalPrivateSecret(csrf) ||
        Object.keys(cookies).length !== 3 || !Object.hasOwn(cookies, 'st_v2_access') ||
        !canonicalPrivateSecret(cookies.st_v2_binding ?? '') ||
        !canonicalPrivateSecret(cookies.st_v2_chain ?? '')) { problem(response, 403); return; }
      if (!cookies.st_v2_access || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cookies.st_v2_access)) {
        problem(response, 401); return;
      }
      const requestContext: CurrentWebRequest = { accessToken: cookies.st_v2_access, exactOrigin: origin,
        bindingCookie: cookies.st_v2_binding!, browserChainId: cookies.st_v2_chain!, csrfToken: csrf };
      const result = await authority.withCurrentWebAuthority(requestContext, async (tx, owner) => {
        const query = await tx.execute<Row>(path.endsWith('/read') ? 'profileRead' : 'profilePatch', [owner.identityId, ...values]);
        if (query.command !== (path.endsWith('/read') ? 'SELECT' : 'UPDATE') || query.rowCount !== 1 || query.rows.length !== 1)
          return { state: 'conflict' as const };
        try { return { state: 'ok' as const, value: view(query.rows[0]) }; }
        catch { return { state: 'conflict' as const }; }
      });
      if (result.state === 'conflict') { problem(response, 409); return; }
      privateJson(response, 200, result.value);
    } catch (error) { problem(response, error instanceof Error && error.message === 'wire' ? 400 : 401); }
  } });
}
