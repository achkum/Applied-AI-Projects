import { parsePrivateManualEdit, parsePrivateManualEdited } from '@subtrack/contracts/private-onboarding';

export type ManualSubscriptionEditBody = ReturnType<typeof parsePrivateManualEdit>;
export type ManualEditIntent = Readonly<{ id: string; key: string; body: ManualSubscriptionEditBody }>;
export class ManualSubscriptionEditApiError extends Error {
  constructor(readonly code: 'invalid' | 'login-required' | 'mode-conflict' | 'receipt-conflict' | 'stale' | 'missing' | 'uncertain') {
    super(code); this.name = 'ManualSubscriptionEditApiError';
  }
}
export function newManualEditIntent(id: string, body: ManualSubscriptionEditBody): ManualEditIntent {
  return Object.freeze({ id, key: crypto.randomUUID(), body: Object.freeze(parsePrivateManualEdit(body)) });
}

async function boundedJson(response: Response, signal: AbortSignal, media: string): Promise<unknown> {
  if (!response.body || response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== media)
    throw new ManualSubscriptionEditApiError('uncertain');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  let length = 0; let body = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for (;;) {
      if (signal.aborted) throw new Error('aborted');
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > 4096) throw new Error('bounded');
      body += decoder.decode(part.value, { stream: true });
    }
    if (signal.aborted) throw new Error('aborted');
    return JSON.parse(body + decoder.decode()) as unknown;
  } catch { cancel(); throw new ManualSubscriptionEditApiError('uncertain'); }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
export async function editManualSubscription(intent: ManualEditIntent, csrf: string, signal: AbortSignal): Promise<ReturnType<typeof parsePrivateManualEdited>> {
  if (!csrf || signal.aborted) throw new ManualSubscriptionEditApiError('login-required');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(intent.key))
    throw new ManualSubscriptionEditApiError('invalid');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(intent.id))
    throw new ManualSubscriptionEditApiError('invalid');
  let body: ManualSubscriptionEditBody;
  try { body = parsePrivateManualEdit(intent.body); } catch { throw new ManualSubscriptionEditApiError('invalid'); }
  let response: Response;
  try {
    response = await fetch(`/v2/subscriptions/owner/manual/${intent.id}/edit`, { method: 'POST', credentials: 'include', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json', 'X-Session-CSRF': csrf, 'Idempotency-Key': intent.key }, body: JSON.stringify(body) });
  } catch { throw new ManualSubscriptionEditApiError('uncertain'); }
  if (signal.aborted) throw new ManualSubscriptionEditApiError('uncertain');
  if (response.status === 200) {
    try {
      const result = parsePrivateManualEdited(await boundedJson(response, signal, 'application/json'));
      if (result.id !== intent.id) throw new ManualSubscriptionEditApiError('uncertain');
      return result;
    }
    catch { throw new ManualSubscriptionEditApiError('uncertain'); }
  }
  // Any authority denial stops the private journey, including a malformed denial body.
  if (response.status === 401 || response.status === 403) throw new ManualSubscriptionEditApiError('login-required');
  const expected: Record<number, readonly string[]> = { 400: ['INVALID_MANUAL_EDIT_REQUEST'],
    404: ['SUBSCRIPTION_NOT_FOUND'], 409: ['MODE_CONFLICT', 'MANUAL_EDIT_IDEMPOTENCY_CONFLICT', 'MANUAL_EDIT_CONFLICT'], 500: ['INTERNAL_ERROR'] };
  if (!expected[response.status]) throw new ManualSubscriptionEditApiError('uncertain');
  const value = await boundedJson(response, signal, 'application/problem+json');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ManualSubscriptionEditApiError('uncertain');
  const problem = value as Record<string, unknown>;
  const title = ({ 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict', 500: 'Internal Server Error' } as Record<number, string>)[response.status];
  if (Object.keys(problem).sort().join(',') !== 'code,status,title,type' || problem.type !== 'about:blank' ||
      problem.status !== response.status || problem.title !== title || !expected[response.status]!.includes(problem.code as string))
    throw new ManualSubscriptionEditApiError('uncertain');
  throw new ManualSubscriptionEditApiError(response.status === 404 ? 'missing' : problem.code === 'MANUAL_EDIT_CONFLICT' ? 'stale' : response.status === 400 ? 'invalid' : problem.code === 'MODE_CONFLICT' ? 'mode-conflict' :
    problem.code === 'MANUAL_EDIT_IDEMPOTENCY_CONFLICT' ? 'receipt-conflict' : 'uncertain');
}
