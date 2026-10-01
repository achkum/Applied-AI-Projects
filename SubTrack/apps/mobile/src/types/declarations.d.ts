declare module '@subtrack/ui-tokens/generated/theme.native.json' {
  const theme: {
    color: {
      light: Record<string, string>;
      dark: Record<string, string>;
    };
    gradient: Record<string, Record<string, unknown>>;
    typography: {
      fontFamily: Record<string, string>;
      fontSize: Record<string, number>;
      fontVariantNumeric?: string;
    };
    radius: Record<string, number>;
    motion: Record<string, unknown>;
    contrastPairs: Array<Record<string, string>>;
    memberAccent: Record<string, unknown>;
    categoryHue: Record<string, Record<string, string>>;
  };
  export default theme;
}

declare module 'i18n-js' {
  interface I18n {
    defaultLocale?: string;
    locale?: string;
    fallbacks?: Record<string, string>;
    translations?: Record<string, Record<string, unknown>>;
    t(key: string, options?: Record<string, string | number>): string;
  }

  const I18n: I18n;
  export default I18n;
}
