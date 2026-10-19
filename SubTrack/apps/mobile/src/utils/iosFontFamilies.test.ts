import {iosFontFamily} from './iosFontFamilies';
import theme from '@subtrack/ui-tokens/billing-month';
import manifest from '../../assets/fonts/billing-month-fonts.json';

it('maps every iOS native theme role to a verified bundled PostScript name',()=>{
  const names=manifest.staticInstances.map(font=>font.postScriptName);
  for(const alias of Object.values(theme.typography.fontFamily))expect(names).toContain(iosFontFamily(alias));
  expect(iosFontFamily('Geist400')).toBe('Geist-Regular');
  expect(iosFontFamily('Bricolage800')).toBe('BricolageGrotesque-ExtraBold');
});
it('preserves existing system families, actual PostScript names and unknown keys',()=>{
  for(const name of ['System','sans-serif','Geist-Regular','constructor','__proto__',''])expect(iosFontFamily(name)).toBe(name);
});
