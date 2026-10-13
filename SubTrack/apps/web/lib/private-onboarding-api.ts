import type { SubscriptionLifecycleTarget, PrivateOwnerPage, PrivateOwnerSubscriptionView } from '@subtrack/contracts';
import { parseJustMeChoice } from '@subtrack/contracts/profile';
import { parseModeView, parsePrivateOwnerPageRequest, parsePrivateOwnerPage, parsePrivateOwnerView, parsePrivateLifecycleResult } from '@subtrack/contracts/private-onboarding';

export class PrivateOnboardingApiError extends Error {
  constructor(readonly code: 'login-required' | 'conflict' | 'missing' | 'unavailable') {
    super(code); this.name = 'PrivateOnboardingApiError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    throw new PrivateOnboardingApiError('unavailable');
  return value as Record<string, unknown>;
}

async function boundedJson(response: Response, signal: AbortSignal, media: string): Promise<unknown> {
  if (!response.body || response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== media)
    throw new PrivateOnboardingApiError('unavailable');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0; let body = '';
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 131072) throw new PrivateOnboardingApiError('unavailable');
      body += decoder.decode(part.value, { stream: true });
    }
    if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
    return JSON.parse(body + decoder.decode()) as unknown;
  } catch {
    cancel();
    if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
    throw new PrivateOnboardingApiError('unavailable');
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

type Kind = 'mode' | 'subscription';
async function request(path: string, method: 'POST' | 'PATCH', body: object, csrf: string, signal: AbortSignal, kind: Kind): Promise<unknown> {
  if (!csrf || signal.aborted) throw new PrivateOnboardingApiError('login-required');
  let response: Response;
  try {
    response = await fetch(path, { method, credentials: 'include', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json', 'X-Session-CSRF': csrf }, body: JSON.stringify(body) });
  } catch {
    if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
    throw new PrivateOnboardingApiError('unavailable');
  }
  if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
  if (response.status === 200) return boundedJson(response, signal, 'application/json');
  const titles: Record<number, string> = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 500: 'Internal Server Error' };
  const codes: Record<Kind, Record<number, readonly string[]>> = {
    mode: { 400: ['INVALID_MODE_REQUEST'], 401: ['AUTHENTICATION_REQUIRED'], 403: ['MODE_REQUEST_REJECTED'],
      409: ['MODE_CONFLICT'], 500: ['INTERNAL_ERROR'] },
    subscription: { 400: ['INVALID_SUBSCRIPTION_REQUEST', 'INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST'],
      401: ['AUTHENTICATION_REQUIRED'], 403: ['SUBSCRIPTION_REQUEST_REJECTED', 'AUTH_CSRF_UNAVAILABLE'],
      404: ['SUBSCRIPTION_NOT_FOUND'], 409: ['LIFECYCLE_CONFLICT', 'MODE_CONFLICT'], 500: ['INTERNAL_ERROR'] },
  };
  const allowedCodes = codes[kind][response.status];
  if (!allowedCodes) throw new PrivateOnboardingApiError('unavailable');
  const problem = record(await boundedJson(response, signal, 'application/problem+json'), ['type', 'title', 'status', 'code']);
  if (problem.type !== 'about:blank' || problem.title !== titles[response.status] || problem.status !== response.status ||
      !allowedCodes.includes(problem.code as string)) throw new PrivateOnboardingApiError('unavailable');
  if (response.status === 401 || response.status === 403) throw new PrivateOnboardingApiError('login-required');
  if (response.status === 404) throw new PrivateOnboardingApiError('missing');
  if (response.status === 409) throw new PrivateOnboardingApiError('conflict');
  throw new PrivateOnboardingApiError('unavailable');
}

export async function chooseJustMe(csrf: string, signal: AbortSignal): Promise<'just-me'> {
  let mode: 'just-me' | null;
  try { mode = parseModeView(await request('/v2/me/mode', 'POST', parseJustMeChoice({ mode: 'just-me' }), csrf, signal, 'mode')).mode; }
  catch (error) { if (error instanceof PrivateOnboardingApiError) throw error; throw new PrivateOnboardingApiError('unavailable'); }
  if (mode !== 'just-me') throw new PrivateOnboardingApiError('unavailable');
  return mode;
}
export async function readMode(csrf: string, signal: AbortSignal): Promise<'just-me' | null> {
  try { return parseModeView(await request('/v2/me/mode/read', 'POST', {}, csrf, signal, 'mode')).mode; }
  catch (error) { if (error instanceof PrivateOnboardingApiError) throw error; throw new PrivateOnboardingApiError('unavailable'); }
}
export async function readOwnerSubscriptions(csrf: string, signal: AbortSignal, cursor?: string): Promise<PrivateOwnerPage> {
  try {
    const body = parsePrivateOwnerPageRequest(cursor === undefined ? {} : { cursor });
    return parsePrivateOwnerPage(await request('/v2/subscriptions/owner/read', 'POST', body, csrf, signal, 'subscription'));
  } catch (error) { if (error instanceof PrivateOnboardingApiError) throw error; throw new PrivateOnboardingApiError('unavailable'); }
}
export async function readOwnerSubscription(id: string, csrf: string, signal: AbortSignal): Promise<PrivateOwnerSubscriptionView> {
  if (!uuid.test(id)) throw new PrivateOnboardingApiError('unavailable');
  try { return parsePrivateOwnerView(await request(`/v2/subscriptions/${id}/read`, 'POST', {}, csrf, signal, 'subscription')); }
  catch (error) { if (error instanceof PrivateOnboardingApiError) throw error; throw new PrivateOnboardingApiError('unavailable'); }
}
export async function patchOwnerSubscription(id: string, status: SubscriptionLifecycleTarget, csrf: string, signal: AbortSignal) {
  if (!uuid.test(id) || !['ACTIVE', 'PAUSED', 'CANCELLED', 'ARCHIVED'].includes(status)) throw new PrivateOnboardingApiError('unavailable');
  try {
    const result = parsePrivateLifecycleResult(await request(`/v2/subscriptions/${id}`, 'PATCH', { status }, csrf, signal, 'subscription'));
    if (result.id !== id || result.status !== status) throw new PrivateOnboardingApiError('unavailable');
    return result;
  } catch (error) { if (error instanceof PrivateOnboardingApiError) throw error; throw new PrivateOnboardingApiError('unavailable'); }
}
