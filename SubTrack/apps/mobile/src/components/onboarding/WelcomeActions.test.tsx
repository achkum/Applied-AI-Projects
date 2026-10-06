import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { catalogs } from '@subtrack/i18n';
import { WelcomeActions } from './WelcomeActions';

let mockLocale: 'en' | 'sv' = 'en';
let mockBusy = false;

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => jest.requireActual<typeof import('../signature/testUtils/contextMocks')>('../signature/testUtils/contextMocks').makeTheme(false),
}));
jest.mock('@/context/I18nContext', () => ({
  useI18n: () => jest.requireActual<typeof import('../signature/testUtils/contextMocks')>('../signature/testUtils/contextMocks').makeI18n(mockLocale),
}));

describe('WelcomeActions', () => {
  beforeEach(() => { mockLocale = 'en'; mockBusy = false; });

  it.each(['en', 'sv'] as const)('uses %s catalog copy', locale => {
    const { tagline, createAccount: create, logIn: login, exploreDemo: demo } = catalogs[locale].onboarding.welcome;
    mockLocale = locale;
    render(<WelcomeActions onCreateAccount={jest.fn()} onLogIn={jest.fn()} onExploreDemo={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'SubTrack' })).toBeTruthy();
    expect(screen.getByText(tagline)).toBeTruthy();
    expect(screen.getByRole('button', { name: create })).toBeTruthy();
    expect(screen.getByRole('button', { name: login })).toBeTruthy();
    expect(screen.getByRole('button', { name: demo })).toBeTruthy();
  });

  it('dispatches each action only to its callback', () => {
    const onCreateAccount = jest.fn();
    const onLogIn = jest.fn();
    const onExploreDemo = jest.fn();
    render(<WelcomeActions onCreateAccount={onCreateAccount} onLogIn={onLogIn} onExploreDemo={onExploreDemo} />);
    fireEvent.press(screen.getByRole('button', { name: catalogs.en.onboarding.welcome.createAccount }));
    fireEvent.press(screen.getByRole('button', { name: catalogs.en.onboarding.welcome.logIn }));
    fireEvent.press(screen.getByRole('button', { name: catalogs.en.onboarding.welcome.exploreDemo }));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
    expect(onLogIn).toHaveBeenCalledTimes(1);
    expect(onExploreDemo).toHaveBeenCalledTimes(1);
  });

  it('marks every action disabled and suppresses dispatch while busy', () => {
    mockBusy = true;
    const callbacks = [jest.fn(), jest.fn(), jest.fn()] as const;
    render(<WelcomeActions onCreateAccount={callbacks[0]} onLogIn={callbacks[1]} onExploreDemo={callbacks[2]} busy={mockBusy} />);
    for (const label of [catalogs.en.onboarding.welcome.createAccount, catalogs.en.onboarding.welcome.logIn, catalogs.en.onboarding.welcome.exploreDemo]) {
      const button = screen.getByRole('button', { name: label });
      expect(button.props.accessibilityState.disabled).toBe(true);
      expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
      fireEvent.press(button);
    }
    callbacks.forEach((callback) => expect(callback).not.toHaveBeenCalled());
  });
});
