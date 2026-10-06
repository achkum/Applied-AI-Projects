import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import mockEnCatalog from '@subtrack/i18n/catalogs/en';
import mockSvCatalog from '@subtrack/i18n/catalogs/sv';
import { DemoHouseholdScreen } from './DemoHouseholdScreen';
import { WelcomeScreen } from './WelcomeScreen';
import * as demoMoney from './demo-money';
import { testTheme as mockTestTheme } from './signature/testTheme';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockLocale: 'en' | 'sv' = 'en';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
jest.mock('@/context/I18nContext', () => ({
  useI18n: () => ({
    locale: mockLocale,
    setLocale: jest.fn(),
    t: (key: string) => {
      const dictionary = mockLocale === 'en' ? mockEnCatalog : mockSvCatalog;
      return key.split('.').reduce((node: unknown, part: string) => (node as Record<string, unknown>)[part], dictionary) as string;
    },
  }),
}));
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'light', isDark: false, setMode: jest.fn(),
    theme: mockTestTheme,
  }),
}));

const englishCopy = mockEnCatalog;
const swedishCopy = mockSvCatalog;

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockLocale = 'en';
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('localized demo household path', () => {
  it('keeps the new demo strings in English and Swedish key parity', () => {
    expect(Object.keys(mockEnCatalog.mobileDemo).sort()).toEqual(Object.keys(mockSvCatalog.mobileDemo).sort());
  });

  it('launches the matching localized route from Welcome', () => {
    const { getByRole } = render(<WelcomeScreen />);
    fireEvent.press(getByRole('button', { name: englishCopy.onboarding.welcome.exploreDemo }));
    expect(mockPush).toHaveBeenCalledWith('/en/demo');

    mockLocale = 'sv';
    const swedish = render(<WelcomeScreen />);
    fireEvent.press(swedish.getByRole('button', { name: swedishCopy.onboarding.welcome.exploreDemo }));
    expect(mockPush).toHaveBeenLastCalledWith('/sv/demo');
  });

  it('shows fictional data, all six original prices and original cadence without a total', () => {
    const { getByText, queryByText } = render(<DemoHouseholdScreen locale="en" />);
    expect(getByText(englishCopy.mobileDemo.banner)).toBeTruthy();
    expect(getByText('Lars & Maria Lindqvist')).toBeTruthy();
    for (const label of ['Disney+', 'YouTube Premium', 'Spotify Duo', 'Storytel', 'Microsoft 365 Family', 'iCloud 2TB']) {
      expect(getByText(label)).toBeTruthy();
    }
    expect(queryByText(/total|equivalent/i)).toBeNull();
  });

  it('keeps direct Swedish route copy Swedish even when the provider locale is English', () => {
    mockLocale = 'en';
    const { getByText, getByRole } = render(<DemoHouseholdScreen locale="sv" />);
    expect(getByText(swedishCopy.mobileDemo.banner)).toBeTruthy();
    expect(getByText(swedishCopy.mobileDemo.description)).toBeTruthy();
    fireEvent.press(getByRole('button', { name: swedishCopy.mobileDemo.return }));
    expect(mockReplace).toHaveBeenCalledWith('/sv');
  });

  it('hides every amount when the exact-money capability is unsupported or throws', () => {
    const capability = jest.spyOn(demoMoney, 'supportsExactDemoMoney').mockReturnValue(false);
    const conversion = jest.spyOn(demoMoney, 'formatDemoSubscriptions');
    const unavailable = render(<DemoHouseholdScreen locale="en" />);
    expect(unavailable.getByText(englishCopy.mobileDemo.unavailable)).toBeTruthy();
    expect(conversion).not.toHaveBeenCalled();
    for (const label of ['Disney+', 'YouTube Premium', 'Spotify Duo', 'Storytel', 'Microsoft 365 Family', 'iCloud 2TB']) {
      expect(unavailable.queryByText(label)).toBeNull();
    }
    expect(unavailable.queryByText('139,00 kr')).toBeNull();
    unavailable.unmount();
    conversion.mockRestore();

    capability.mockImplementation(() => { throw new Error('probe failed'); });
    const failed = render(<DemoHouseholdScreen locale="en" />);
    expect(failed.getByText(englishCopy.mobileDemo.unavailable)).toBeTruthy();
    expect(failed.queryByText('139,00 kr')).toBeNull();
    expect(failed.queryByText('Disney+')).toBeNull();
    capability.mockRestore();

    const conversionFailure = jest.spyOn(demoMoney, 'formatDemoSubscriptions').mockImplementation(() => {
      throw new Error('format failed');
    });
    const formattingFailure = render(<DemoHouseholdScreen locale="en" />);
    expect(formattingFailure.getByText(englishCopy.mobileDemo.unavailable)).toBeTruthy();
    expect(formattingFailure.queryByText('139,00 kr')).toBeNull();
    conversionFailure.mockRestore();
  });

  it('uses localized launcher labels and a 44-unit target', () => {
    const { getByRole } = render(<WelcomeScreen />);
    const launcher = getByRole('button', { name: englishCopy.onboarding.welcome.exploreDemo });
    expect(launcher.props.style.minHeight).toBeGreaterThanOrEqual(44);
  });
});
