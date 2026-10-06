import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RootLayout from '../../app/_layout';
import * as SplashScreen from 'expo-splash-screen';

const mockUseFonts = jest.fn();
jest.mock('expo-font', () => ({ useFonts: (...args: unknown[]) => mockUseFonts(...args) }));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock('expo-splash-screen', () => ({
  __esModule: true,
  preventAutoHideAsync: jest.fn().mockRejectedValue(new Error('prevent unavailable')),
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
      const { mode, theme } = themeContext.useTheme();
      return (
        <Native.View testID="router-stack">
          <Native.Text testID="provider-state">{`${locale}|${t('scope.personal')}|${mode}`}</Native.Text>
          <Native.Text testID="font-state">{`${theme.typography.fontFamily.ui}|${theme.typography.fontFamily.display}`}</Native.Text>
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
    mockUseFonts.mockReset().mockReturnValue([true, null]);
    jest.mocked(SplashScreen.hideAsync).mockClear().mockResolvedValue(true);
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

  it('keeps providers and splash pending, then starts once fonts load', async () => {
    mockUseFonts.mockReturnValue([false, null]);
    const app = render(<RootLayout />);
    expect(app.toJSON()).toBeNull(); expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    expect(mockStorage.getItem).not.toHaveBeenCalled();
    mockUseFonts.mockReturnValue([true, null]);
    await act(async () => app.rerender(<RootLayout />));
    expect(await screen.findByTestId('router-stack')).toBeTruthy();
    expect(screen.getByTestId('font-state').props.children).toBe('Manrope|Fraunces');
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    await act(async () => app.rerender(<RootLayout />));
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });
  it('uses system aliases after font error and catches splash hide rejection', async () => {
    mockUseFonts.mockReturnValue([false, new Error('font load failed')]);
    jest.mocked(SplashScreen.hideAsync).mockRejectedValueOnce(new Error('splash unavailable'));
    render(<RootLayout />);
    expect(await screen.findByTestId('router-stack')).toBeTruthy();
    expect(screen.getByTestId('font-state').props.children).toBe('System|System');
    await act(async () => Promise.resolve());
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('provider-state').props.children).toBe('en|Me|system');
  });
});
