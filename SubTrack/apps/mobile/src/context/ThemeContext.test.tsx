import React from 'react';
import { Text, Platform } from 'react-native';
import { act, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import themeData from '@subtrack/ui-tokens';
import billingMonthTheme from '@subtrack/ui-tokens/billing-month';
import { useTheme } from './ThemeContext';
import { RootProvider } from '../providers/RootProvider';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/context/I18nContext', () => ({ I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
function ThemeProbe() { const { theme, mode } = useTheme(); return <Text testID="theme-probe">{JSON.stringify({ theme, mode })}</Text>; }
describe('font fallback context integration', () => {
  const originalPlatform=Platform.OS;
  beforeEach(() => {Object.defineProperty(Platform,'OS',{configurable:true,value:'ios'});jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);jest.mocked(AsyncStorage.setItem).mockClear();});
  afterEach(()=>Object.defineProperty(Platform,'OS',{configurable:true,value:originalPlatform}));
  it('forwards fallback through RootProvider and preserves preferences and original tokens', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('dark');
    const original = JSON.stringify(themeData);
    const screen = render(<RootProvider useSystemFonts systemFontFamily="sans-serif"><ThemeProbe /></RootProvider>);
    await act(async () => Promise.resolve());
    const output = JSON.parse(screen.getByTestId('theme-probe').props.children);
    expect(output.mode).toBe('dark');
    expect(output.theme.typography.fontFamily).toEqual(Object.fromEntries(Object.keys(billingMonthTheme.typography.fontFamily).map(role=>[role,'sans-serif'])));
    expect(output.theme.color).toEqual(billingMonthTheme.color);
    expect(JSON.stringify(themeData)).toBe(original);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
  it('uses bundled native Billing Month roles for existing ThemeProvider callers', async () => {
    const screen = render(<RootProvider><ThemeProbe /></RootProvider>);
    await act(async () => Promise.resolve());
    expect(JSON.parse(screen.getByTestId('theme-probe').props.children).theme).toEqual(billingMonthTheme);
  });
  it('preserves web defaults and the established web fallback roles',async()=>{
    Object.defineProperty(Platform,'OS',{configurable:true,value:'web'});const first=render(<RootProvider><ThemeProbe/></RootProvider>);await act(async()=>Promise.resolve());expect(JSON.parse(first.getByTestId('theme-probe').props.children).theme).toEqual(themeData);first.unmount();
    const fallback=render(<RootProvider useSystemFonts systemFontFamily="sans-serif"><ThemeProbe/></RootProvider>);await act(async()=>Promise.resolve());const output=JSON.parse(fallback.getByTestId('theme-probe').props.children).theme;expect(output.color).toEqual(themeData.color);expect(output.typography.fontFamily).toEqual({...themeData.typography.fontFamily,ui:'sans-serif',display:'sans-serif'});
  });
});
