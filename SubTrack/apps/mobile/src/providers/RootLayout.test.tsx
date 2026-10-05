import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RootLayout from '../../app/_layout';
import * as SplashScreen from 'expo-splash-screen';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock(
  '@subtrack/ui-tokens/generated/theme.native.json',
  () => ({
    __esModule: true,
    default: jest.requireActual('@subtrack/ui-tokens'),
  }),
  { virtual: true },
);

jest.mock('expo-splash-screen', () => ({
  __esModule: true,
  preventAutoHideAsync: jest.fn().mockResolvedValue(true),
  hideAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-router', () => {
  const Native = jest.requireActual<typeof import('react-native')>('react-native');
  const i18nContext = jest.requireActual<typeof import('@/context/I18nContext')>(
    '@/context/I18nContext',
  );
  const themeContext = jest.requireActual<typeof import('@/context/ThemeContext')>(
    '@/context/ThemeContext',
  );
  const Stack = Object.assign(
    function Stack({ children }: { children?: React.ReactNode }) {
      const { locale, t } = i18nContext.useI18n();
      const { mode } = themeContext.useTheme();
      return (
        <Native.View testID="router-stack">
          <Native.Text testID="provider-state">{`${locale}|${t('scope.personal')}|${mode}`}</Native.Text>
          {children}
        </Native.View>
      );
    },
    { Screen: () => null },
  );
  return { Stack };
});

const mockStorage = jest.mocked(AsyncStorage);

describe('root layout startup imports', () => {
  beforeEach(() => {
    mockStorage.getItem.mockClear();
    mockStorage.setItem.mockClear();
    mockStorage.getItem.mockResolvedValue(null);
  });

  it('mounts the router and hides the splash through named native exports', async () => {
    render(<RootLayout />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('router-stack')).toBeTruthy();
    expect(screen.getByTestId('provider-state').props.children).toBe('en|Me|system');
    expect(mockStorage.getItem).toHaveBeenCalledWith('theme-mode-preference');
    expect(mockStorage.getItem).toHaveBeenCalledWith('locale-preference');
    await waitFor(() => expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1));
  });
});
