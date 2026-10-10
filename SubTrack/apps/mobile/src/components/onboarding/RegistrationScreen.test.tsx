import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { catalogs } from '@subtrack/i18n';
import WelcomeRoute from '../../../app/welcome';
import { RegistrationScreen } from './RegistrationScreen';

let mockLocale: 'en' | 'sv' = 'en';
const mockBack = jest.fn();
const mockPush = jest.fn();
const registrationCopy = { en: catalogs.en.onboarding.registration, sv: catalogs.sv.onboarding.registration };

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }));
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => jest.requireActual<typeof import('../signature/testUtils/contextMocks')>('../signature/testUtils/contextMocks').makeTheme(false),
}));
jest.mock('@/context/I18nContext', () => ({
  useI18n: () => {
    return jest.requireActual<typeof import('../signature/testUtils/contextMocks')>('../signature/testUtils/contextMocks').makeI18n(mockLocale);
  },
}));

describe('RegistrationScreen', () => {
  beforeEach(() => { mockLocale = 'en'; jest.clearAllMocks(); });

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
    expect(screen.queryByText('person@example.com')).toBeNull();
  });

  it('presents login as explicitly unavailable and provides back navigation', () => {
    render(<RegistrationScreen mode="login" />);
    expect(screen.getByText(registrationCopy.en.loginUnavailable)).toBeTruthy();
    expect(screen.queryByLabelText(catalogs.en.onboarding.identifier.emailLabel)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: registrationCopy.en.backLabel }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('composes welcome actions into the approved routes', () => {
    render(<WelcomeRoute />);
    fireEvent.press(screen.getByRole('button', { name: catalogs.en.onboarding.welcome.createAccount }));
    fireEvent.press(screen.getByRole('button', { name: catalogs.en.onboarding.welcome.logIn }));
    expect(mockPush).toHaveBeenNthCalledWith(1, '/register');
    expect(mockPush).toHaveBeenNthCalledWith(2, { pathname: '/register', params: { mode: 'login' } });

    mockLocale = 'sv';
    render(<WelcomeRoute />);
    fireEvent.press(screen.getByRole('button', { name: catalogs.sv.onboarding.welcome.exploreDemo }));
    expect(mockPush).toHaveBeenLastCalledWith('/sv/demo');
  });
});
