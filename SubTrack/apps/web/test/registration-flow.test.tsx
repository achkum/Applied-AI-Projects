import { catalogs } from '@subtrack/i18n';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'jest-axe';
import { RegistrationFlow } from '../components/onboarding/registration-flow';

const token = 'A'.repeat(43);
const view = { displayName: null, avatarColourToken: null, avatarEmoji: null,
  language: 'en', theme: 'system', defaultCurrency: 'SEK', profileComplete: false };
const response = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
}));
function startMocks() {
  return vi.spyOn(globalThis, 'fetch')
    .mockImplementationOnce(() => response(200, { nonce: token }))
    .mockImplementationOnce(() => response(202, { challengeId: 'challenge', status: 'accepted', nextBrowserNonce: token }))
    .mockImplementationOnce(() => response(200, { purpose: 'enroll_identifier', proof: `v2.${token}`, nextBrowserNonce: token }))
    .mockImplementationOnce(() => response(201, { transport: 'web', continuation: `wep.${token}`, status: 'pending', nextBrowserNonce: token }))
    .mockImplementationOnce(() => response(200, { transport: 'web', verifiedEnrollment: `wev.${token}`, status: 'verified', nextBrowserNonce: token }))
    .mockImplementationOnce(() => response(201, { transport: 'web', sessionId: '123e4567-e89b-42d3-a456-426614174000', csrfToken: 'private-csrf' }))
    .mockImplementationOnce(() => response(200, view));
}
async function reachOtp(locale: 'en' | 'sv' = 'en') {
  const identifier = catalogs[locale].onboarding.identifier;
  fireEvent.change(screen.getByLabelText(identifier.emailLabel), { target: { value: 'synthetic@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: identifier.continueLabel }));
  await screen.findByLabelText(catalogs[locale].onboarding.registration.otpLabel);
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: catalogs[locale].onboarding.registration.otpTitle }));
}
async function reachProfile(locale: 'en' | 'sv' = 'en') {
  await reachOtp(locale);
  const copy = catalogs[locale].onboarding.registration;
  fireEvent.change(screen.getByLabelText(copy.otpLabel), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: copy.verifyLabel }));
  await screen.findByRole('button', { name: copy.simulatorAction });
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: copy.simulatorTitle }));
  fireEvent.click(screen.getByRole('button', { name: copy.simulatorAction }));
  await screen.findByLabelText(catalogs[locale].onboarding.profile.displayName);
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: catalogs[locale].onboarding.profile.title }));
}
afterEach(() => vi.restoreAllMocks());

describe('mounted private enrollment and profile', () => {
  it.each(['en', 'sv'] as const)('requires an explicit fresh %s login after a reload stop', async (locale) => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'reload' } as PerformanceNavigationTiming,
    ]);
    const freshNonce = 'B'.repeat(43);
    const sessionNonce = 'C'.repeat(43);
    const freshProof = `v2.${'D'.repeat(43)}`;
    const persisted = { ...view, language: locale, displayName: 'Returning owner', profileComplete: true };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, { nonce: freshNonce }))
      .mockImplementationOnce(() => response(200, { transport: 'web', loginProof: freshProof, status: 'verified', nextBrowserNonce: sessionNonce }))
      .mockImplementationOnce(() => response(201, { transport: 'web', sessionId: '123e4567-e89b-42d3-a456-426614174000', csrfToken: 'fresh-reload-csrf' }))
      .mockImplementationOnce(() => response(200, persisted))
      .mockImplementationOnce(() => response(200, { mode: 'just-me' }))
      .mockImplementationOnce(() => response(200, { items: [], nextCursor: null }));
    const copy = catalogs[locale].onboarding;
    render(<RegistrationFlow locale={locale} initialEntry="login" />);
    const freshEntry = await screen.findByRole('button', { name: copy.login.freshLogin });
    expect(screen.getByRole('alert').textContent).toBe(copy.registration.verifiedLoginRequired);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: copy.login.simulatorAction })).toBeNull();
    fireEvent.click(freshEntry);
    const heading = screen.getByRole('heading', { name: copy.login.title });
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.login.simulatorAction }));
    expect(await screen.findByText(copy.ownerSubscriptions.empty)).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/v2/auth/browser-nonce', '/v2/auth/login/simulator/verify', '/v2/auth/session',
      '/v2/me/profile/read', '/v2/me/mode/read', '/v2/subscriptions/owner/read',
    ]);
    expect((fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>)['X-Browser-Nonce']).toBe(freshNonce);
    expect((fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>)['X-Browser-Nonce']).toBe(sessionNonce);
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string)).toEqual({ transport: 'web', loginProof: freshProof });
    expect(fetchMock.mock.calls.slice(0, 3).every(([, options]) =>
      !Object.hasOwn(options?.headers ?? {}, 'X-Session-CSRF'))).toBe(true);
    expect(fetchMock.mock.calls.slice(3).every(([, options]) =>
      (options?.headers as Record<string, string>)['X-Session-CSRF'] === 'fresh-reload-csrf')).toBe(true);
    expect(document.body.textContent).not.toContain('fresh-reload-csrf');
    expect(document.body.textContent).not.toContain(freshProof);
  });

  it('returns through verified login and reads persisted profile and mode before owner list without writes', async () => {
    const persisted = { ...view, displayName: 'Existing owner', profileComplete: true };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, { nonce: token }))
      .mockImplementationOnce(() => response(200, { transport: 'web', loginProof: `v2.${token}`, status: 'verified', nextBrowserNonce: token }))
      .mockImplementationOnce(() => response(201, { transport: 'web', sessionId: '123e4567-e89b-42d3-a456-426614174000', csrfToken: 'new-csrf' }))
      .mockImplementationOnce(() => response(200, persisted))
      .mockImplementationOnce(() => response(200, { mode: 'just-me' }))
      .mockImplementationOnce(() => response(200, { items: [], nextCursor: null }));
    render(<RegistrationFlow locale="en" initialEntry="login" />);
    fireEvent.click(screen.getByRole('button', { name: catalogs.en.onboarding.login.simulatorAction }));
    expect(await screen.findByText(catalogs.en.onboarding.ownerSubscriptions.empty)).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/v2/auth/browser-nonce', '/v2/auth/login/simulator/verify', '/v2/auth/session',
      '/v2/me/profile/read', '/v2/me/mode/read', '/v2/subscriptions/owner/read',
    ]);
    expect(fetchMock.mock.calls.slice(3).every(([, options]) =>
      (options?.headers as Record<string, string>)['X-Session-CSRF'] === 'new-csrf')).toBe(true);
    expect(document.body.textContent).not.toContain('new-csrf');
  });

  it('resumes incomplete profile and absent mode without an early owner read or mutation', async () => {
    const setup = (profileComplete: boolean) => vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, { nonce: token }))
      .mockImplementationOnce(() => response(200, { transport: 'web', loginProof: `v2.${token}`, status: 'verified', nextBrowserNonce: token }))
      .mockImplementationOnce(() => response(201, { transport: 'web', sessionId: '123e4567-e89b-42d3-a456-426614174000', csrfToken: 'csrf' }))
      .mockImplementationOnce(() => response(200, { ...view, displayName: 'Already entered', profileComplete }))
      .mockImplementationOnce(() => response(200, { mode: null }));
    const incomplete = setup(false);
    const first = render(<RegistrationFlow locale="en" initialEntry="login" />);
    fireEvent.click(screen.getByRole('button', { name: catalogs.en.onboarding.login.simulatorAction }));
    expect(await screen.findByDisplayValue('Already entered')).toBeTruthy();
    expect(incomplete).toHaveBeenCalledTimes(5);
    first.unmount(); vi.restoreAllMocks();
    const complete = setup(true);
    render(<RegistrationFlow locale="en" initialEntry="login" />);
    fireEvent.click(screen.getByRole('button', { name: catalogs.en.onboarding.login.simulatorAction }));
    expect(await screen.findByRole('button', { name: catalogs.en.onboarding.mode.choose })).toBeTruthy();
    expect(complete).toHaveBeenCalledTimes(5);
    expect(screen.queryByText(catalogs.en.onboarding.profile.saved)).toBeNull();
  });
  it('awaits trusted simulator and shows only separately reread profile after save', async () => {
    const fetchMock = startMocks()
      .mockImplementationOnce(() => response(200, { ...view, displayName: 'Synthetic Owner', profileComplete: true }))
      .mockImplementationOnce(() => response(200, { ...view, displayName: 'Synthetic Owner', profileComplete: true }));
    render(<RegistrationFlow locale="en" />);
    await reachProfile();
    expect(document.body.textContent).not.toContain(`wep.${token}`);
    expect(document.body.textContent).not.toContain('private-csrf');
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Synthetic Owner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText('Profile saved and confirmed.');
    expect(screen.getByRole('status').textContent).toBe('Profile complete.');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Profile saved and confirmed.' }));
    expect(fetchMock.mock.calls.map(([url]) => url).slice(-3)).toEqual(['/v2/me/profile/read', '/v2/me/profile', '/v2/me/profile/read']);
    expect(JSON.parse(fetchMock.mock.calls[7]?.[1]?.body as string)).toEqual({ displayName: 'Synthetic Owner' });
    expect(document.body.textContent).not.toContain('private-csrf');
  });

  it('offers the finite Bob enrollment simulator choice in both locales', async () => {
    for (const locale of ['en', 'sv'] as const) {
      const fetchMock = startMocks();
      const mounted = render(<RegistrationFlow locale={locale} />);
      await reachOtp(locale);
      const registration = catalogs[locale].onboarding.registration;
      fireEvent.change(screen.getByLabelText(registration.otpLabel), { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: registration.verifyLabel }));
      await screen.findByRole('button', { name: registration.simulatorAction });
      const fixture = screen.getByLabelText(catalogs[locale].onboarding.login.fixtureLabel);
      fireEvent.change(fixture, { target: { value: 'bob' } });
      fireEvent.click(screen.getByRole('button', { name: registration.simulatorAction }));
      await screen.findByLabelText(catalogs[locale].onboarding.profile.displayName);
      expect(JSON.parse(fetchMock.mock.calls[4]![1]!.body as string)).toEqual({
        transport: 'web', continuation: `wep.${token}`, demoIdentity: 'bob',
      });
      mounted.unmount(); vi.restoreAllMocks();
    }
  });

  it('shows uncertain save after lost PATCH and never announces saved', async () => {
    startMocks().mockRejectedValueOnce(new Error('lost response')).mockImplementationOnce(() => response(200, view));
    render(<RegistrationFlow locale="en" />); await reachProfile();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Synthetic Owner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByText(catalogs.en.onboarding.profile.uncertain);
    expect(document.activeElement).toBe(screen.getByText(catalogs.en.onboarding.profile.uncertain));
    expect(screen.queryByText(catalogs.en.onboarding.profile.saved)).toBeNull();
  });

  it('aborts on Back and ignores late OTP responses', async () => {
    let resolveVerify: ((value: Response) => void) | undefined;
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, { nonce: token }))
      .mockImplementationOnce(() => response(202, { challengeId: 'challenge', status: 'accepted', nextBrowserNonce: token }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveVerify = resolve; }));
    render(<RegistrationFlow locale="en" />); await reachOtp();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await act(async () => resolveVerify?.(await response(200, { purpose: 'enroll_identifier', proof: `v2.${token}`, nextBrowserNonce: token })));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(catalogs.en.onboarding.registration.simulatorTitle)).toBeNull();
  });

  it.each(['en', 'sv'] as const)('labels identifier and OTP accessibly in %s', async (locale) => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => response(200, { nonce: token }))
      .mockImplementationOnce(() => response(202, { challengeId: 'challenge', status: 'accepted', nextBrowserNonce: token }));
    const { container } = render(<RegistrationFlow locale={locale} />);
    expect((await axe(container)).violations).toEqual([]);
    await reachOtp(locale);
    expect((await axe(container)).violations).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: catalogs[locale].onboarding.registration.verifyLabel }));
    const otp = screen.getByLabelText(catalogs[locale].onboarding.registration.otpLabel);
    expect(document.activeElement).toBe(otp);
    expect(otp.getAttribute('aria-invalid')).toBe('true');
    expect(otp.getAttribute('aria-describedby')).toBe('registration-otp-error');
  });

  it('continues from confirmed profile through explicit mode, owner row and reread status without a second PATCH', async () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    const owner = { source: 'MANUAL' as const, visibility: 'owner', id, customName: 'Synthetic Subscription', merchantId: null, merchantName: null,
      categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'ACTIVE', expectedAmountMinor: '12345',
      currency: 'SEK', nextChargeDate: null, alwaysPrivate: true };
    const fetchMock = startMocks()
      .mockImplementationOnce(() => response(200, { ...view, displayName: 'Synthetic Owner', profileComplete: true }))
      .mockImplementationOnce(() => response(200, { ...view, displayName: 'Synthetic Owner', profileComplete: true }))
      .mockImplementationOnce(() => response(200, { mode: 'just-me' }))
      .mockImplementationOnce(() => response(200, { mode: 'just-me' }))
      .mockImplementationOnce(() => response(200, { items: [owner], nextCursor: null }))
      .mockImplementationOnce(() => response(200, owner))
      .mockImplementationOnce(() => response(200, { id, status: 'PAUSED' }))
      .mockImplementationOnce(() => response(200, { ...owner, status: 'PAUSED' }));
    render(<RegistrationFlow locale="en" />); await reachProfile();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Synthetic Owner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    const choose = await screen.findByRole('button', { name: 'Just me' });
    fireEvent.click(choose);
    expect(await screen.findByRole('heading', { name: 'Your subscriptions' })).toBe(document.activeElement);
    fireEvent.click(screen.getByRole('button', { name: /Synthetic Subscription, Active/ }));
    expect(await screen.findByRole('heading', { name: 'Subscription details' })).toBe(document.activeElement);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(await screen.findByText('Saved status confirmed.')).toBeTruthy();
    expect(screen.getByText('Paused · Monthly')).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => url).slice(-5)).toEqual([
      '/v2/me/mode/read', '/v2/subscriptions/owner/read', `/v2/subscriptions/${id}/read`,
      `/v2/subscriptions/${id}`, `/v2/subscriptions/${id}/read`,
    ]);
    expect(fetchMock.mock.calls.filter(([url, options]) => url === `/v2/subscriptions/${id}` && options?.method === 'PATCH')).toHaveLength(1);
  });
});


describe('manual Add intent and authoritative readback', () => {
  const id = '123e4567-e89b-42d3-a456-426614174009';
  const manualRow = { source: 'MANUAL', visibility: 'owner', id, customName: 'Manual Proof', merchantId: null,
    merchantName: null, categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', status: 'ACTIVE',
    expectedAmountMinor: '1234', currency: 'SEK', nextChargeDate: null, alwaysPrivate: true };
  const copy = catalogs.en.onboarding;
  const problem = (status: number, code: string) => Promise.resolve(new Response(JSON.stringify({ type: 'about:blank',
    title: ({ 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 409: 'Conflict', 500: 'Internal Server Error' } as Record<number, string>)[status], status, code }),
    { status, headers: { 'Content-Type': 'application/problem+json' } }));
  async function emptyOwner() {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => response(200, { nonce: token }))
      .mockImplementationOnce(() => response(200, { transport: 'web', loginProof: `v2.${token}`, status: 'verified', nextBrowserNonce: token }))
      .mockImplementationOnce(() => response(201, { transport: 'web', sessionId: id, csrfToken: 'manual-csrf' }))
      .mockImplementationOnce(() => response(200, { ...view, displayName: 'Owner', profileComplete: true }))
      .mockImplementationOnce(() => response(200, { mode: 'just-me' }))
      .mockImplementationOnce(() => response(200, { items: [], nextCursor: null }));
    render(<RegistrationFlow locale="en" initialEntry="login" />);
    fireEvent.click(screen.getByRole('button', { name: copy.login.simulatorAction }));
    await screen.findByText(copy.ownerSubscriptions.empty);
    return fetch;
  }
  async function draft() {
    fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.title }));
    await screen.findByLabelText(copy.manualSubscription.name);
    fireEvent.change(screen.getByLabelText(copy.manualSubscription.name), { target: { value: 'Manual Proof' } });
    fireEvent.change(screen.getByLabelText(copy.manualSubscription.category), { target: { value: 'VIDEO_STREAMING' } });
    fireEvent.change(screen.getByLabelText(copy.manualSubscription.amount), { target: { value: '12.34' } });
  }
  it('returns cancel focus, then explicitly checks the same immutable intent after a lost response', async () => {
    const fetch = await emptyOwner(); await draft();
    fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.cancel }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: copy.manualSubscription.title }));
    await draft();
    fetch.mockRejectedValueOnce(new Error('lost response'));
    fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.save }));
    await screen.findByText(copy.manualSubscription.uncertain);
    expect(screen.queryByRole('button', { name: copy.manualSubscription.save })).toBeNull();
    expect(screen.getByLabelText(copy.manualSubscription.name).hasAttribute('disabled')).toBe(true);
    const first = fetch.mock.calls.at(-1)!;
    fetch.mockImplementationOnce(() => response(201, { id }))
      .mockImplementationOnce(() => response(200, manualRow))
      .mockImplementationOnce(() => response(200, { items: [manualRow], nextCursor: null }));
    fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.check }));
    await screen.findByText(copy.manualSubscription.confirmed);
    const writes = fetch.mock.calls.filter(([url]) => url === '/v2/subscriptions/owner/manual');
    expect(writes).toHaveLength(2); expect(writes[1]![0]).toBe(first[0]);
    expect(writes[1]![1]!.headers).toEqual(first[1]!.headers); expect(writes[1]![1]!.body).toBe(first[1]!.body);
    expect(fetch.mock.calls.slice(-2).map(([url]) => url)).toEqual([`/v2/subscriptions/${id}/read`, '/v2/subscriptions/owner/read']);
    expect(document.body.textContent).not.toContain('manual-csrf');
  });
  it('after known 201 retries only detail/list reads', async () => {
    const fetch = await emptyOwner(); await draft();
    fetch.mockImplementationOnce(() => response(201, { id })).mockRejectedValueOnce(new Error('read lost'));
    fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.save }));
    await screen.findByText(copy.manualSubscription.readError);
    fetch.mockImplementationOnce(() => response(200, manualRow))
      .mockImplementationOnce(() => response(200, { items: [manualRow], nextCursor: null }));
    fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.retryRead }));
    await screen.findByText(copy.manualSubscription.confirmed);
    expect(fetch.mock.calls.filter(([url]) => url === '/v2/subscriptions/owner/manual')).toHaveLength(1);
  });
  it('locks the pending draft and ignores duplicate submission; unmount discards a late committed response', async () => {
    const fetch = await emptyOwner(); await draft();
    let resolve!: (response: Response) => void;
    fetch.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    const save = screen.getByRole('button', { name: copy.manualSubscription.save });
    fireEvent.click(save); fireEvent.click(save);
    expect(screen.getByLabelText(copy.manualSubscription.amount).hasAttribute('disabled')).toBe(true);
    expect(fetch.mock.calls.filter(([url]) => url === '/v2/subscriptions/owner/manual')).toHaveLength(1);
    // Remove the entire page while the write result is unknown.
    const pendingSignal = fetch.mock.calls.at(-1)![1]!.signal!;
    const { cleanup } = await import('@testing-library/react'); cleanup();
    expect(pendingSignal.aborted).toBe(true);
    await act(async () => { resolve(new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } })); });
    expect(fetch.mock.calls.filter(([url]) => url === `/v2/subscriptions/${id}/read`)).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Manual Proof');
  });
  it.each([401, 403])('clears private form on authority %s', async status => {
    const fetch = await emptyOwner(); await draft();
    fetch.mockImplementationOnce(() => problem(status, status === 401 ? 'AUTHENTICATION_REQUIRED' : 'MANUAL_REQUEST_REJECTED'));
    fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.save }));
    await screen.findByText(copy.registration.verifiedLoginRequired);
    expect(screen.queryByLabelText(copy.manualSubscription.name)).toBeNull();
    expect(screen.queryByText('Manual Proof')).toBeNull();
  });
  it('retains a 400 draft but permits a distinct explicit intent only after an edit', async () => {
    const intentKeys = vi.spyOn(globalThis.crypto, 'randomUUID');
    const fetch = await emptyOwner(); await draft(); fetch.mockImplementationOnce(() => problem(400, 'INVALID_MANUAL_REQUEST'));
    intentKeys.mockClear();
    fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.save }));
    await screen.findByText(copy.manualSubscription.invalid);
    expect((screen.getByLabelText(copy.manualSubscription.name) as HTMLInputElement).value).toBe('Manual Proof');
    const rejectedSave = screen.getByRole('button', { name: copy.manualSubscription.save });
    expect(rejectedSave.hasAttribute('disabled')).toBe(true);
    fireEvent.click(rejectedSave);
    fireEvent.submit(rejectedSave.closest('form')!);
    expect(fetch.mock.calls.filter(([url]) => url === '/v2/subscriptions/owner/manual')).toHaveLength(1);
    expect(intentKeys).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(copy.manualSubscription.amount), { target: { value: '12.35' } });
    expect(rejectedSave.hasAttribute('disabled')).toBe(false);
    fetch.mockImplementationOnce(() => response(201, { id })).mockImplementationOnce(() => response(200, manualRow))
      .mockImplementationOnce(() => response(200, { items: [manualRow], nextCursor: null }));
    fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.save })); await screen.findByText(copy.manualSubscription.confirmed);
    const writes = fetch.mock.calls.filter(([url]) => url === '/v2/subscriptions/owner/manual');
    expect(writes).toHaveLength(2);
    expect(intentKeys).toHaveBeenCalledTimes(2);
    expect(JSON.parse(writes[1]![1]!.body as string).expectedAmountMinor).toBe('1235');
    expect((writes[0]![1]!.headers as Record<string, string>)['Idempotency-Key']).not.toBe((writes[1]![1]!.headers as Record<string, string>)['Idempotency-Key']);
  });
  it.each(['MODE_CONFLICT', 'MANUAL_IDEMPOTENCY_CONFLICT'])('reconciles authoritative profile/mode/list before a new Add after %s', async code => {
    const fetch = await emptyOwner(); await draft(); fetch.mockImplementationOnce(() => problem(409, code));
    if (code === 'MODE_CONFLICT') fetch.mockImplementationOnce(() => response(200, { ...view, displayName: 'Owner', profileComplete: true }))
      .mockImplementationOnce(() => response(200, { mode: 'just-me' }))
      .mockImplementationOnce(() => response(200, { items: [manualRow], nextCursor: null }));
    fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.save }));
    if (code === 'MANUAL_IDEMPOTENCY_CONFLICT') {
      await screen.findByText(copy.manualSubscription.receiptConflict);
      expect(screen.queryByText(copy.manualSubscription.confirmed)).toBeNull();
      fetch.mockImplementationOnce(() => response(200, { ...view, displayName: 'Owner', profileComplete: true }))
        .mockImplementationOnce(() => response(200, { mode: 'just-me' }))
        .mockImplementationOnce(() => response(200, { items: [manualRow], nextCursor: null }));
      fireEvent.click(screen.getByRole('button', { name: copy.manualSubscription.reconcile }));
    }
    await screen.findByRole('button', { name: /Manual Proof/ });
    expect(fetch.mock.calls.slice(-3).map(([url]) => url)).toEqual(['/v2/me/profile/read', '/v2/me/mode/read', '/v2/subscriptions/owner/read']);
    expect(fetch.mock.calls.filter(([url]) => url === '/v2/subscriptions/owner/manual')).toHaveLength(1);
  });
});
