import { parsePrivateManualCreate, parsePrivateManualCreated } from '@subtrack/contracts/private-onboarding';

export type ManualSubscriptionBody = ReturnType<typeof parsePrivateManualCreate>;
export type ManualIntent = Readonly<{ key: string; body: ManualSubscriptionBody }>;
export class ManualSubscriptionApiError extends Error {
  constructor(readonly code: 'invalid' | 'login-required' | 'mode-conflict' | 'receipt-conflict' | 'uncertain') {
    super(code); this.name = 'ManualSubscriptionApiError';
  }
}
export function newManualIntent(body: ManualSubscriptionBody): ManualIntent {
  return Object.freeze({ key: crypto.randomUUID(), body: Object.freeze(parsePrivateManualCreate(body)) });
}

async function boundedJson(response: Response, signal: AbortSignal, media: string): Promise<unknown> {
  if (!response.body || response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== media)
    throw new ManualSubscriptionApiError('uncertain');
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
  } catch { cancel(); throw new ManualSubscriptionApiError('uncertain'); }
  finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
export async function saveManualSubscription(intent: ManualIntent, csrf: string, signal: AbortSignal): Promise<string> {
  if (!csrf || signal.aborted) throw new ManualSubscriptionApiError('login-required');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(intent.key))
    throw new ManualSubscriptionApiError('invalid');
  let body: ManualSubscriptionBody;
  try { body = parsePrivateManualCreate(intent.body); } catch { throw new ManualSubscriptionApiError('invalid'); }
  let response: Response;
  try {
    response = await fetch('/v2/subscriptions/owner/manual', { method: 'POST', credentials: 'include', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json', 'X-Session-CSRF': csrf, 'Idempotency-Key': intent.key }, body: JSON.stringify(body) });
  } catch { throw new ManualSubscriptionApiError('uncertain'); }
  if (signal.aborted) throw new ManualSubscriptionApiError('uncertain');
  if (response.status === 201) {
    try { return parsePrivateManualCreated(await boundedJson(response, signal, 'application/json')).id; }
    catch { throw new ManualSubscriptionApiError('uncertain'); }
  }
  // Any authority denial stops the private journey, including a malformed denial body.
  if (response.status === 401 || response.status === 403) throw new ManualSubscriptionApiError('login-required');
  const expected: Record<number, readonly string[]> = { 400: ['INVALID_MANUAL_REQUEST'],
    409: ['MODE_CONFLICT', 'MANUAL_IDEMPOTENCY_CONFLICT'], 500: ['INTERNAL_ERROR'] };
  if (!expected[response.status]) throw new ManualSubscriptionApiError('uncertain');
  const value = await boundedJson(response, signal, 'application/problem+json');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ManualSubscriptionApiError('uncertain');
  const problem = value as Record<string, unknown>;
  const title = ({ 400: 'Bad Request', 409: 'Conflict', 500: 'Internal Server Error' } as Record<number, string>)[response.status];
  if (Object.keys(problem).sort().join(',') !== 'code,status,title,type' || problem.type !== 'about:blank' ||
      problem.status !== response.status || problem.title !== title || !expected[response.status]!.includes(problem.code as string))
    throw new ManualSubscriptionApiError('uncertain');
  throw new ManualSubscriptionApiError(response.status === 400 ? 'invalid' : problem.code === 'MODE_CONFLICT' ? 'mode-conflict' :
    problem.code === 'MANUAL_IDEMPOTENCY_CONFLICT' ? 'receipt-conflict' : 'uncertain');
}
