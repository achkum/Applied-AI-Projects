import React from 'react';
import { ThemeProvider } from '@/context/ThemeContext';
import { I18nProvider } from '@/context/I18nContext';

interface RootProviderProps {
  children: React.ReactNode;
  useSystemFonts?: boolean;
  systemFontFamily?: string;
}

export function RootProvider({
  children,
  useSystemFonts = false,
  systemFontFamily,
}: RootProviderProps) {
  return (
    <ThemeProvider
      useSystemFonts={useSystemFonts}
      systemFontFamily={systemFontFamily}
    >
      <I18nProvider>{children}</I18nProvider>
    </ThemeProvider>
  );
}
