const aliases: Readonly<Record<string,string>> = Object.freeze({
  Geist400: 'Geist-Regular',
  Geist500: 'Geist-Medium',
  Geist600: 'Geist-SemiBold',
  Bricolage600: 'BricolageGrotesque-SemiBold',
  Bricolage700: 'BricolageGrotesque-Bold',
  Bricolage800: 'BricolageGrotesque-ExtraBold',
});

/** Android's pinned native loader recognises bundled assets/fonts by filename. */
export function androidFontFamily(alias: string): string {
  return Object.prototype.hasOwnProperty.call(aliases,alias) ? aliases[alias]! : alias;
}
