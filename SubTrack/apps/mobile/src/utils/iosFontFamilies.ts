const postScriptNames: Readonly<Record<string, string>> = Object.freeze({
  Geist400: 'Geist-Regular',
  Geist500: 'Geist-Medium',
  Geist600: 'Geist-SemiBold',
  Bricolage600: 'BricolageGrotesque-SemiBold',
  Bricolage700: 'BricolageGrotesque-Bold',
  Bricolage800: 'BricolageGrotesque-ExtraBold',
});

/** Expo's pinned iOS loader reports bundled UIAppFonts by their PostScript names. */
export function iosFontFamily(alias: string): string {
  return Object.prototype.hasOwnProperty.call(postScriptNames, alias) ? postScriptNames[alias]! : alias;
}
