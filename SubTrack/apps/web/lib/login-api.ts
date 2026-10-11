export type DemoIdentity = 'alice' | 'bob';

export class LoginApiError extends Error {
  constructor(readonly code: 'restart-required' | 'unavailable') {
    super(code);
    this.name = 'LoginApiError';
  }
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PROOF = /^v2\.[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

async function payload(response: Response, signal: AbortSignal, media: string): Promise<unknown> {
  if (!response.body || response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== media) {
    await response.body?.cancel();
    throw new LoginApiError('unavailable');
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let json = '';
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const part = await reader.read();
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32 * 1024) throw new LoginApiError('unavailable');
      json += decoder.decode(part.value, { stream: true });
    }
    json += decoder.decode();
    return JSON.parse(json) as unknown;
  } catch (error) {
    cancel();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    throw error instanceof LoginApiError ? error : new LoginApiError('unavailable');
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

async function post(path: string, body: object, nonce: string | null, status: number, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  let response: Response;
  try {
    response = await fetch(`/v2/auth/${path}`, {
      method: 'POST', credentials: 'include', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(),
        ...(nonce === null ? {} : { 'X-Browser-Nonce': nonce }) },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new LoginApiError('unavailable');
  }
  if (signal.aborted) { await response.body?.cancel(); throw new DOMException('Aborted', 'AbortError'); }
  if (response.status === 409) {
    const problem = await payload(response, signal, 'application/problem+json');
    if (exact(problem, ['type', 'title', 'status', 'code']) && problem.type === 'about:blank' &&
        problem.title === 'Authentication unavailable' && problem.status === 409 &&
        problem.code === 'AUTH_RESTART_REQUIRED') throw new LoginApiError('restart-required');
    throw new LoginApiError('unavailable');
  }
  if (response.status !== status) { await response.body?.cancel(); throw new LoginApiError('unavailable'); }
  return payload(response, signal, 'application/json');
}

export async function startLogin(signal: AbortSignal): Promise<string> {
  const result = await post('browser-nonce', { purpose: 'session' }, null, 200, signal);
  if (!exact(result, ['nonce']) || typeof result.nonce !== 'string' || !TOKEN.test(result.nonce))
    throw new LoginApiError('unavailable');
  return result.nonce;
}

export async function verifyLogin(identity: DemoIdentity, nonce: string, signal: AbortSignal) {
  if (!['alice', 'bob'].includes(identity) || !TOKEN.test(nonce)) throw new LoginApiError('unavailable');
  const result = await post('login/simulator/verify', { transport: 'web', demoIdentity: identity }, nonce, 200, signal);
  if (!exact(result, ['transport', 'loginProof', 'status', 'nextBrowserNonce']) || result.transport !== 'web' ||
      result.status !== 'verified' || typeof result.loginProof !== 'string' || !PROOF.test(result.loginProof) ||
      typeof result.nextBrowserNonce !== 'string' || !TOKEN.test(result.nextBrowserNonce)) throw new LoginApiError('unavailable');
  return { loginProof: result.loginProof, nextBrowserNonce: result.nextBrowserNonce };
}

export async function completeLogin(proof: string, nonce: string, signal: AbortSignal) {
  if (!PROOF.test(proof) || !TOKEN.test(nonce)) throw new LoginApiError('unavailable');
  const result = await post('session', { transport: 'web', loginProof: proof }, nonce, 201, signal);
  if (!exact(result, ['transport', 'sessionId', 'csrfToken']) || result.transport !== 'web' ||
      typeof result.sessionId !== 'string' || !UUID.test(result.sessionId) ||
      typeof result.csrfToken !== 'string' || result.csrfToken.length < 1 || result.csrfToken.length > 4096)
    throw new LoginApiError('unavailable');
  return { csrfToken: result.csrfToken };
}
