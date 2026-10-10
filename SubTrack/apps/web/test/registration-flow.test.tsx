import { catalogs } from '@subtrack/i18n';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationFlow } from '../components/onboarding/registration-flow';

vi.mock('../components/onboarding/identifier-entry', () => ({
  IdentifierEntry: ({ onContinue }: { onContinue: (value: { channel: 'email' | 'phone'; identifier: string }) => void }) => (
    <button type="button" onClick={() => onContinue({ channel: 'email', identifier: 'private@example.test' })}>continue identifier</button>
  ),
}));

vi.mock('@subtrack/ui', () => ({ Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} /> }));

function response(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
}

function nonce() { return { nonce: 'nonce-a' }; }
function start() { return { challengeId: 'challenge-a', status: 'accepted', nextBrowserNonce: 'nonce-b' }; }
function verify() { return { purpose: 'enroll_identifier', proof: 'sensitive-proof', nextBrowserNonce: 'nonce-c' }; }

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `key-${Math.random()}-unique`) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('registration flow', () => {
  it('starts with browser nonce then accepts a six digit OTP without claiming sign-in or displaying proof', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, nonce()))
      .mockImplementationOnce(() => response(202, start()))
      .mockImplementationOnce(() => response(200, verify()));
    render(<RegistrationFlow locale="en" />);
    fireEvent.click(screen.getByText('continue identifier'));
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeTruthy());
    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringMatching(/browser-nonce$/), expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ 'X-Browser-Nonce': 'nonce-a' });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).not.toHaveProperty('Origin');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('"purpose":"enroll_identifier"');
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123' } });
    expect((screen.getByText('Verify') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(catalogs.en.onboarding.registration.acceptedMessage));
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ 'X-Browser-Nonce': 'nonce-b' });
    expect(document.body.textContent).not.toContain('sensitive-proof');
    expect(document.body.textContent).not.toContain('private@example.test');
    expect(document.body.textContent).not.toContain('signed in');
  });

  it('aborts the active request on unmount and ignores a late bootstrap response', async () => {
    let resolveBootstrap: ((value: Response) => void) | undefined;
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_input, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((resolve) => { resolveBootstrap = resolve; });
    });
    const view = render(<RegistrationFlow locale="en" />);
    fireEvent.click(screen.getByText('continue identifier'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(requestSignal?.aborted).toBe(true);
    resolveBootstrap?.({ ok: true, status: 200, json: () => Promise.resolve(nonce()) } as Response);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('ignores repeated identifier submission while the first request is pending', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
    render(<RegistrationFlow locale="en" />);
    const continueButton = screen.getByText('continue identifier');
    fireEvent.click(continueButton);
    fireEvent.click(continueButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('requires a fresh bootstrap and challenge after a consumed nonce response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, nonce()))
      .mockImplementationOnce(() => response(202, start()))
      .mockImplementationOnce(() => response(409, { code: 'AUTH_RESTART_REQUIRED' }))
      .mockImplementationOnce(() => response(200, { nonce: 'fresh-nonce' }))
      .mockImplementationOnce(() => response(202, { ...start(), nextBrowserNonce: 'fresh-next' }));
    render(<RegistrationFlow locale="en" />);
    fireEvent.click(screen.getByText('continue identifier'));
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(screen.getByText('Restart verification')).toBeTruthy());
    fireEvent.click(screen.getByText('Restart verification'));
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeTruthy());
    expect(fetchMock.mock.calls[3]?.[0]).toMatch(/browser-nonce$/);
    expect(fetchMock.mock.calls[4]?.[1]?.headers).toMatchObject({ 'X-Browser-Nonce': 'fresh-nonce' });
  });
});
