import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SandboxEntry } from './SandboxEntry';
import { catalogs } from '@subtrack/i18n';
const mockSession = { phase: 'verification-required', available: true, resumable: false, bootstrap: jest.fn().mockResolvedValue(undefined), login: jest.fn().mockResolvedValue(undefined) };
jest.mock('@/state/SandboxSession', () => ({ useSandboxSession: () => mockSession }));
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ isDark: false, theme: jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json') }) }));
jest.mock('@/context/I18nContext', () => ({ useI18n: () => jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en') }));
beforeEach(() => { mockSession.available = true; mockSession.resumable = false; mockSession.phase = 'verification-required'; mockSession.bootstrap.mockClear(); mockSession.login.mockClear(); });
it('clearly labels simulated fictional data and creates only on explicit entry', () => {
  render(<SandboxEntry />); expect(screen.queryByText(catalogs.en.onboarding.sandbox.noticeShort)).toBeNull(); expect(mockSession.bootstrap).not.toHaveBeenCalled(); fireEvent.press(screen.getByRole('button', { name: catalogs.en.onboarding.sandbox.enter })); expect(mockSession.bootstrap).toHaveBeenCalledWith('en');
});
it('returning possession uses explicit resume, while disabled composition cannot create', () => {
  mockSession.resumable = true; const view = render(<SandboxEntry />); fireEvent.press(screen.getByRole('button', { name: catalogs.en.onboarding.sandbox.resume })); expect(mockSession.login).toHaveBeenCalledTimes(1); view.unmount(); mockSession.available = false; render(<SandboxEntry />); expect(screen.getByRole('button', { name: catalogs.en.onboarding.sandbox.resume }).props.accessibilityState.disabled).toBe(true); expect(screen.getByText(catalogs.en.onboarding.sandbox.unavailable)).toBeTruthy();
});
it('does not expose raw failure text or automatically retry', async () => {
  mockSession.bootstrap.mockRejectedValueOnce(Error('private failure detail')); render(<SandboxEntry />); fireEvent.press(screen.getByRole('button', { name: catalogs.en.onboarding.sandbox.enter })); await waitFor(() => expect(screen.getByText(catalogs.en.onboarding.sandbox.unavailable)).toBeTruthy()); expect(mockSession.bootstrap).toHaveBeenCalledTimes(1); expect(screen.queryByText('private failure detail')).toBeNull();
});
