export { parsePositiveSekInput } from '../../../../packages/money/src/parse-positive-sek-input';
export { formatMinorUnits } from '../../../../packages/money/src/formatter';

import {formatMinorUnits} from '../../../../packages/money/src/formatter';
import {parsePositiveSekInput} from '../../../../packages/money/src/parse-positive-sek-input';
/** Presentation-only adapter around the shared exact Money formatter/parser. */
export function nativeSekDraft(minor:string,locale:'sv'|'en'):string {
 const formatted=formatMinorUnits(BigInt(minor),'SEK',{locale,display:'code'}).replace('SEK','').replace(/\s/g,'');
 const draft=locale==='en'?formatted.replace(',','.'):formatted;
 if(parsePositiveSekInput(draft,locale).toString()!==minor)throw new RangeError('Invalid positive SEK draft');
 return draft;
}
