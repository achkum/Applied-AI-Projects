import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import themeData from '@subtrack/ui-tokens';
import { useTheme } from './ThemeContext';
import { RootProvider } from '../providers/RootProvider';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/context/I18nContext', () => ({ I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
function ThemeProbe() { const { theme, mode } = useTheme(); return <Text testID="theme-probe">{JSON.stringify({ theme, mode })}</Text>; }
describe('font fallback context integration', () => {
  beforeEach(() => jest.mocked(AsyncStorage.getItem).mockResolvedValue(null));
  it('forwards fallback through RootProvider and preserves preferences and original tokens', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('dark');
    const original = JSON.stringify(themeData);
    const screen = render(<RootProvider useSystemFonts systemFontFamily="sans-serif"><ThemeProbe /></RootProvider>);
    await act(async () => Promise.resolve());
    const output = JSON.parse(screen.getByTestId('theme-probe').props.children);
    expect(output.mode).toBe('dark');
    expect(output.theme.typography.fontFamily).toMatchObject({ ui: 'sans-serif', display: 'sans-serif', mono: themeData.typography.fontFamily.mono });
    expect(output.theme.color).toEqual(themeData.color);
    expect(JSON.stringify(themeData)).toBe(original);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
  it('keeps generated aliases for existing ThemeProvider callers', async () => {
    const screen = render(<RootProvider><ThemeProbe /></RootProvider>);
    await act(async () => Promise.resolve());
    expect(JSON.parse(screen.getByTestId('theme-probe').props.children).theme).toEqual(themeData);
  });
});
