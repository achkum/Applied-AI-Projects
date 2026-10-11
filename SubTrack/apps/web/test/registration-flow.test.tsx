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
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Profile saved and confirmed.' }));
    expect(fetchMock.mock.calls.map(([url]) => url).slice(-3)).toEqual(['/v2/me/profile/read', '/v2/me/profile', '/v2/me/profile/read']);
    expect(JSON.parse(fetchMock.mock.calls[7]?.[1]?.body as string)).toEqual({ displayName: 'Synthetic Owner' });
    expect(document.body.textContent).not.toContain('private-csrf');
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
});
