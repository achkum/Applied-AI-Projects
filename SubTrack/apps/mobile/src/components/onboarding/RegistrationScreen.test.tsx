import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { catalogs } from '@subtrack/i18n';
import WelcomeRoute from '../../../app/welcome';
import RegisterRoute from '../../../app/register';
import { RegistrationScreen } from './RegistrationScreen';

let mockLocale: 'en' | 'sv' = 'en';
let mockRouteParams: Record<string, string | string[] | undefined> = {};
const mockBack = jest.fn();
const mockPush = jest.fn();
const registrationCopy = { en: catalogs.en.onboarding.registration, sv: catalogs.sv.onboarding.registration };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockRouteParams,
}));
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => jest.requireActual<typeof import('../signature/testUtils/contextMocks')>('../signature/testUtils/contextMocks').makeTheme(false),
}));
jest.mock('@/context/I18nContext', () => ({
  useI18n: () => {
    return jest.requireActual<typeof import('../signature/testUtils/contextMocks')>('../signature/testUtils/contextMocks').makeI18n(mockLocale);
  },
}));

describe('RegistrationScreen', () => {
  beforeEach(() => { mockLocale = 'en'; mockRouteParams = {}; jest.clearAllMocks(); });

  it.each(['en', 'sv'] as const)('shows localized identifier registration in %s', locale => {
    mockLocale = locale;
    render(<RegistrationScreen />);
    expect(screen.getByRole('header', { name: registrationCopy[locale].title })).toBeTruthy();
    expect(screen.getByRole('button', { name: catalogs[locale].onboarding.identifier.continueLabel })).toBeTruthy();
  });

  it('validates locally and then explains the unavailable continuation without displaying the identifier', () => {
    render(<RegistrationScreen />);
    const input = screen.getByLabelText(catalogs.en.onboarding.identifier.emailLabel);
    fireEvent.changeText(input, 'person@example.com');
    fireEvent.press(screen.getByRole('button', { name: catalogs.en.onboarding.identifier.continueLabel }));
    expect(screen.getByText(registrationCopy.en.identifierValid)).toBeTruthy();
    expect(screen.getByText(registrationCopy.en.bankIdRequired)).toBeTruthy();
    expect(screen.getByText(registrationCopy.en.unavailable)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('person@example.com')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each(['en', 'sv'] as const)('presents login as explicitly unavailable in %s and provides back navigation', locale => {
    mockLocale = locale;
    render(<RegistrationScreen mode="login" />);
    expect(screen.getByText(registrationCopy[locale].loginUnavailable)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByLabelText(catalogs[locale].onboarding.identifier.emailLabel)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: registrationCopy[locale].backLabel }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it.each(['en', 'sv'] as const)('routes only the explicit login enum in %s and ignores sensitive query values', locale => {
    mockLocale = locale;
    mockRouteParams = {
      mode: 'login',
      identifier: 'person@example.com',
      code: '123456',
      proof: 'opaque-proof',
      token: 'opaque-token',
    };
    render(<RegisterRoute />);
    expect(screen.getByText(registrationCopy[locale].loginUnavailable)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByLabelText(catalogs[locale].onboarding.identifier.emailLabel)).toBeNull();
    for (const sensitive of ['person@example.com', '123456', 'opaque-proof', 'opaque-token']) {
      expect(screen.queryByText(sensitive)).toBeNull();
    }
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each<{ mode: string | string[] | undefined }>([
    { mode: 'unknown' },
    { mode: ['login', 'register'] },
    { mode: undefined },
  ])('keeps unsupported route mode $mode on registration', ({ mode }) => {
    mockRouteParams = { mode };
    render(<RegisterRoute />);
    expect(screen.getByRole('header', { name: registrationCopy.en.title })).toBeTruthy();
    expect(screen.getByRole('button', { name: catalogs.en.onboarding.identifier.continueLabel })).toBeTruthy();
  });

  it.each(['en', 'sv'] as const)('composes welcome actions into approved %s routes', locale => {
    mockLocale = locale;
    render(<WelcomeRoute />);
    fireEvent.press(screen.getByRole('button', { name: catalogs[locale].onboarding.welcome.createAccount }));
    fireEvent.press(screen.getByRole('button', { name: catalogs[locale].onboarding.welcome.logIn }));
    expect(mockPush).toHaveBeenNthCalledWith(1, '/register');
    expect(mockPush).toHaveBeenNthCalledWith(2, { pathname: '/register', params: { mode: 'login' } });
    fireEvent.press(screen.getByRole('button', { name: catalogs[locale].onboarding.welcome.exploreDemo }));
    expect(mockPush).toHaveBeenNthCalledWith(3, `/${locale}/demo`);
  });
});
