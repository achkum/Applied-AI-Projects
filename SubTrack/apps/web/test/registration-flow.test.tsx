import { catalogs } from '@subtrack/i18n';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'jest-axe';
import { RegistrationFlow } from '../components/onboarding/registration-flow';

function response(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': status === 409 ? 'application/problem+json' : 'application/json' } }));
}

function continueIdentifier(locale: 'en' | 'sv' = 'en') {
  const copy = catalogs[locale].onboarding.identifier;
  fireEvent.change(screen.getByLabelText(copy.emailLabel), { target: { value: 'private@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: copy.continueLabel }));
}

function nonce() { return { nonce: 'nonce-a' }; }
function start() { return { challengeId: 'challenge-a', status: 'accepted', nextBrowserNonce: 'nonce-b' }; }
function verify() { return { purpose: 'enroll_identifier', proof: 'sensitive-proof', nextBrowserNonce: 'nonce-c' }; }

afterEach(() => vi.restoreAllMocks());

describe('registration flow', () => {
  it('starts with browser nonce then accepts a six digit OTP without claiming sign-in or displaying proof', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, nonce()))
      .mockImplementationOnce(() => response(202, start()))
      .mockImplementationOnce(() => response(200, verify()));
    render(<RegistrationFlow locale="en" />);
    continueIdentifier();
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
    continueIdentifier();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(requestSignal?.aborted).toBe(true);
    resolveBootstrap?.(await response(200, nonce()));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('ignores repeated identifier submission while the first request is pending', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
    render(<RegistrationFlow locale="en" />);
    fireEvent.change(screen.getByLabelText(catalogs.en.onboarding.identifier.emailLabel), { target: { value: 'private@example.test' } });
    const form = screen.getByLabelText(catalogs.en.onboarding.identifier.emailLabel).closest('form')!;
    // Both callbacks run before React commits busy state.
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('requires a fresh bootstrap and challenge after a consumed nonce response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, nonce()))
      .mockImplementationOnce(() => response(202, start()))
      .mockImplementationOnce(() => response(409, { type: 'about:blank', title: 'Conflict', status: 409, code: 'AUTH_RESTART_REQUIRED' }))
      .mockImplementationOnce(() => response(200, { nonce: 'fresh-nonce' }))
      .mockImplementationOnce(() => response(202, { ...start(), nextBrowserNonce: 'fresh-next' }));
    render(<RegistrationFlow locale="en" />);
    continueIdentifier();
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));
    await waitFor(() => expect(screen.getByText('Restart verification')).toBeTruthy());
    fireEvent.click(screen.getByText('Restart verification'));
    await waitFor(() => expect(screen.getByLabelText('Verification code')).toBeTruthy());
    expect(fetchMock.mock.calls[3]?.[0]).toMatch(/browser-nonce$/);
    expect(fetchMock.mock.calls[4]?.[1]?.headers).toMatchObject({ 'X-Browser-Nonce': 'fresh-nonce' });
  });

  it.each([401, 500, 'network', 'malformed'])('requires fresh verification after %s failure', async (failure) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, nonce()))
      .mockImplementationOnce(() => response(202, start()));
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('sensitive error'));
    else fetchMock.mockImplementationOnce(() => response(typeof failure === 'number' ? failure : 200, {}));
    fetchMock.mockImplementationOnce(() => response(200, { nonce: 'fresh-nonce' }))
      .mockImplementationOnce(() => response(202, { ...start(), challengeId: 'fresh-challenge', nextBrowserNonce: 'fresh-next' }))
      .mockImplementationOnce(() => response(200, verify()));
    render(<RegistrationFlow locale="en" />); continueIdentifier();
    await screen.findByLabelText('Verification code');
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await screen.findByRole('button', { name: 'Restart verification' });
    expect(screen.queryByLabelText('Verification code')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(catalogs.en.onboarding.registration.unavailable);
    fireEvent.click(screen.getByRole('button', { name: 'Restart verification' }));
    const input = await screen.findByLabelText('Verification code');
    expect((input as HTMLInputElement).value).toBe('');
    fireEvent.change(input, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await screen.findByRole('status');
    expect(JSON.parse(fetchMock.mock.calls[5]?.[1]?.body as string)).toEqual({ challengeId: 'fresh-challenge', code: '654321', transport: 'web' });
    expect(fetchMock.mock.calls[5]?.[1]?.headers).toMatchObject({ 'X-Browser-Nonce': 'fresh-next' });
    expect(document.body.textContent).not.toContain('sensitive error');
  });

  it('allows Back during verification and ignores late success after a new identifier starts', async () => {
    let resolveVerify: ((value: Response) => void) | undefined;
    let oldSignal: AbortSignal | undefined;
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, nonce()))
      .mockImplementationOnce(() => response(202, start()))
      .mockImplementationOnce((_url, init) => {
        oldSignal = init?.signal as AbortSignal;
        return new Promise<Response>((resolve) => { resolveVerify = resolve; });
      })
      .mockImplementationOnce(() => response(200, { nonce: 'new-chain' }))
      .mockImplementationOnce(() => response(202, { ...start(), challengeId: 'new-challenge' }));
    render(<RegistrationFlow locale="en" />); continueIdentifier();
    await screen.findByLabelText('Verification code');
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect((screen.getByLabelText('Verification code') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(oldSignal?.aborted).toBe(true);
    expect((screen.getByLabelText(catalogs.en.onboarding.identifier.emailLabel) as HTMLInputElement).value).toBe('');
    continueIdentifier();
    await screen.findByLabelText('Verification code');
    await act(async () => resolveVerify?.(await response(200, verify())));
    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByLabelText('Verification code') as HTMLInputElement).value).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('dispatches only one verification for synchronous repeated form submissions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, nonce()))
      .mockImplementationOnce(() => response(202, start()))
      .mockImplementationOnce(() => new Promise<Response>(() => undefined));
    render(<RegistrationFlow locale="en" />); continueIdentifier();
    const input = await screen.findByLabelText('Verification code');
    fireEvent.change(input, { target: { value: '123456' } });
    act(() => { fireEvent.submit(input.closest('form')!); fireEvent.submit(input.closest('form')!); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(['en', 'sv'] as const)('uses actual labeled controls and accessible states in %s', async (locale) => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => response(200, nonce()))
      .mockImplementationOnce(() => response(202, start()));
    const { container } = render(<RegistrationFlow locale={locale} />);
    expect(container.querySelector('main')?.getAttribute('lang')).toBe(locale);
    expect((await axe(container)).violations).toEqual([]);
    continueIdentifier(locale);
    const copy = catalogs[locale].onboarding.registration;
    const input = await screen.findByLabelText(copy.otpLabel);
    expect((await axe(container)).violations).toEqual([]);
    fireEvent.change(input, { target: { value: '１２３abc1234567' } });
    expect((input as HTMLInputElement).value).toBe('123456');
    fireEvent.click(screen.getByRole('button', { name: copy.backLabel }));
    expect(screen.queryByLabelText(copy.otpLabel)).toBeNull();
  });
});
