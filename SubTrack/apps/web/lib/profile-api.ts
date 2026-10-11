import { type ProfilePatch, type ProfileView } from '@subtrack/contracts';
import { parseProfilePatch, parseProfileView } from '@subtrack/contracts/profile';

export class ProfileApiError extends Error {
  constructor(readonly code: 'unavailable' | 'login-required' | 'conflict') {
    super(code);
    this.name = 'ProfileApiError';
  }
}

const problems: Record<number, string> = {
  400: 'INVALID_PROFILE_REQUEST',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'PROFILE_REQUEST_REJECTED',
  409: 'PROFILE_CONFLICT',
  500: 'INTERNAL_ERROR',
};

async function boundedJson(response: Response, signal: AbortSignal, media: string): Promise<unknown> {
  if (!response.body || response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== media)
    throw new ProfileApiError('unavailable');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let text = '';
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
      const part = await reader.read();
      if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 32768) throw new ProfileApiError('unavailable');
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch {
    cancel();
    if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
    throw new ProfileApiError('unavailable');
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

async function request(method: 'POST' | 'PATCH', body: object, csrf: string, signal: AbortSignal): Promise<ProfileView> {
  if (!csrf || signal.aborted) throw new ProfileApiError('login-required');
  let response: Response;
  try {
    response = await fetch(method === 'POST' ? '/v2/me/profile/read' : '/v2/me/profile', {
      method, credentials: 'include', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json', 'X-Session-CSRF': csrf },
      body: JSON.stringify(body),
    });
  } catch {
    if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
    throw new ProfileApiError('unavailable');
  }
  if (signal.aborted) throw new DOMException('Request aborted', 'AbortError');
  if (response.status === 200) {
    const value = await boundedJson(response, signal, 'application/json');
    try { return parseProfileView(value); } catch { throw new ProfileApiError('unavailable'); }
  }
  if (!Object.hasOwn(problems, response.status)) throw new ProfileApiError('unavailable');
  const value = await boundedJson(response, signal, 'application/problem+json');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProfileApiError('unavailable');
  const problem = value as Record<string, unknown>;
  const title: Record<number, string> = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 409: 'Conflict', 500: 'Internal Server Error' };
  if (Object.keys(problem).length !== 4 || problem.type !== 'about:blank' || problem.title !== title[response.status] ||
      problem.status !== response.status || problem.code !== problems[response.status]) throw new ProfileApiError('unavailable');
  if (response.status === 401 || response.status === 403) throw new ProfileApiError('login-required');
  if (response.status === 409) throw new ProfileApiError('conflict');
  throw new ProfileApiError('unavailable');
}

export function readProfile(csrf: string, signal: AbortSignal): Promise<ProfileView> {
  return request('POST', {}, csrf, signal);
}

export function patchProfile(patch: ProfilePatch, csrf: string, signal: AbortSignal): Promise<ProfileView> {
  let validated: ProfilePatch;
  try { validated = parseProfilePatch(patch); } catch { throw new ProfileApiError('unavailable'); }
  return request('PATCH', validated, csrf, signal);
}
