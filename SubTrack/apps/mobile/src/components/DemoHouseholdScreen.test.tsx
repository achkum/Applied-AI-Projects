import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import mockEnCatalog from '@subtrack/i18n/catalogs/en';
import mockSvCatalog from '@subtrack/i18n/catalogs/sv';
import demoFixture from '@subtrack/i18n/catalogs/demo-fixture';
import { DemoHouseholdScreen } from './DemoHouseholdScreen';
import { WelcomeScreen } from './WelcomeScreen';
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

  it('shows exact English and Swedish display strings with each original cadence and no total', () => {
    const expected = [
      ['Disney+', '139,00 kr', 'Billed monthly', 'Debiteras månadsvis'],
      ['YouTube Premium', '219,00 kr', 'Billed monthly', 'Debiteras månadsvis'],
      ['Spotify Duo', '159,00 kr', 'Billed monthly', 'Debiteras månadsvis'],
      ['Storytel', '179,00 kr', 'Billed monthly', 'Debiteras månadsvis'],
      ['Microsoft 365 Family', '1 199,00 kr', 'Billed annually', 'Debiteras årsvis'],
      ['iCloud 2TB', '99,00 kr', 'Billed monthly', 'Debiteras månadsvis'],
    ] as const;
    const english = render(<DemoHouseholdScreen locale="en" />);
    expect(english.getByText(englishCopy.mobileDemo.banner)).toBeTruthy();
    expect(english.getByText(englishCopy.mobileDemo.title)).toBeTruthy();
    for (const [merchant, amount, cadence] of expected) {
      expect(english.getByLabelText(`${merchant}, ${amount}, ${cadence}`)).toBeTruthy();
    }
    expect(english.queryByText(/total|equivalent/i)).toBeNull();
    english.unmount();

    mockLocale = 'sv';
    const swedish = render(<DemoHouseholdScreen locale="sv" />);
    expected.forEach(([merchant, , , cadence], index) => {
      const subscription = demoFixture.subscriptions[index];
      if (!subscription) throw new Error(`Missing fixture row at index ${index}`);
      expect(swedish.getByLabelText(`${merchant}, ${subscription.displayAmount.sv}, ${cadence}`)).toBeTruthy();
    });
    expect(swedish.getByText(swedishCopy.mobileDemo.banner)).toBeTruthy();
    expect(swedish.queryByText(/total|motsvarande/i)).toBeNull();
  });

  it.each(['en', 'sv'] as const)('hides all amounts when a localized display string is missing in %s', (locale) => {
    const incompleteFixture = {
      ...demoFixture,
      subscriptions: demoFixture.subscriptions.map((subscription, index) => index === 0
        ? { ...subscription, displayAmount: { ...subscription.displayAmount, [locale]: '' } }
        : subscription),
    } as typeof demoFixture;
    const { getByText, queryByText } = render(<DemoHouseholdScreen locale={locale} fixture={incompleteFixture} />);
    expect(getByText(locale === 'en' ? englishCopy.mobileDemo.unavailable : swedishCopy.mobileDemo.unavailable)).toBeTruthy();
    expect(queryByText('139,00 kr')).toBeNull();
    expect(queryByText('219,00 kr')).toBeNull();
    expect(queryByText('Disney+')).toBeNull();
  });

  it.each([0, 5])('hides all amounts when the fixture has only %s rows', (count) => {
    const fixture = { ...demoFixture, subscriptions: demoFixture.subscriptions.slice(0, count) };
    const { getByText, queryByText } = render(<DemoHouseholdScreen locale="en" fixture={fixture} />);
    expect(getByText(englishCopy.mobileDemo.unavailable)).toBeTruthy();
    for (const row of demoFixture.subscriptions) {
      expect(queryByText(row.merchantName)).toBeNull();
      expect(queryByText(row.displayAmount.en)).toBeNull();
    }
  });

  it('keeps direct Swedish route copy Swedish even when the provider locale is English', () => {
    mockLocale = 'en';
    const { getByText, getByRole } = render(<DemoHouseholdScreen locale="sv" />);
    expect(getByText(swedishCopy.mobileDemo.banner)).toBeTruthy();
    expect(getByText(swedishCopy.mobileDemo.description)).toBeTruthy();
    fireEvent.press(getByRole('button', { name: swedishCopy.mobileDemo.return }));
    expect(mockReplace).toHaveBeenCalledWith('/sv');
  });


  it('uses localized launcher labels and a 44-unit target', () => {
    const { getByRole } = render(<WelcomeScreen />);
    const launcher = getByRole('button', { name: englishCopy.onboarding.welcome.exploreDemo });
    expect(launcher.props.style.minHeight).toBeGreaterThanOrEqual(44);
  });
});
