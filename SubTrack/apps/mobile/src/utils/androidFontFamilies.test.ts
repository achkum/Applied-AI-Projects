import {androidFontFamily} from './androidFontFamilies';
import theme from '@subtrack/ui-tokens/billing-month';
it('maps every Android native role to its existing static asset filename and preserves unknown aliases',()=>{
 const expected={Geist400:'Geist-Regular',Geist500:'Geist-Medium',Geist600:'Geist-SemiBold',Bricolage600:'BricolageGrotesque-SemiBold',Bricolage700:'BricolageGrotesque-Bold',Bricolage800:'BricolageGrotesque-ExtraBold'};
 for(const [alias,name] of Object.entries(expected))expect(androidFontFamily(alias)).toBe(name);
 for(const alias of Object.values(theme.typography.fontFamily))expect(Object.values(expected)).toContain(androidFontFamily(alias));
 for(const alias of ['System','sans-serif','constructor','__proto__',''])expect(androidFontFamily(alias)).toBe(alias);
});
