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
