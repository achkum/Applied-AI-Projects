/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro and Jest resolver hooks are loaded as CommonJS. */
/* Native exact-edge compatibility; shared Money implementation is unchanged. */
const path=require('node:path');
function createNativeMoneyResolver({origin,target,previous}){
 return function nativeMoneyResolver(context,request,platform){
  const delegate=previous??context.resolveRequest;
  if(typeof delegate!=='function'||delegate===nativeMoneyResolver)throw new Error('Missing upstream Money resolver');
  const native=(platform==='ios'||platform==='android')&&typeof context.originModulePath==='string';
  const importing=native?path.resolve(context.originModulePath):null;
  const formatter=native&&importing===origin&&request==='./formatter.js';
  const analytics=native&&request==='./money.js'&&['recurring-cost.ts','price-increase.ts'].some(file=>importing===path.join(path.dirname(origin),file));
  return delegate(context,formatter?target:analytics?origin:request,platform);
 };
}
function createJestMoneyResolver({directory,target}){
 return function jestMoneyResolver(request,options){
  // Jest exposes the importing directory; retain exact source/specifier mappings.
  const scoped=path.resolve(options.basedir)===directory;
  return options.defaultResolver(scoped&&request==='./formatter.js'?target:scoped&&request==='./money.js'?path.join(directory,'money.ts'):request,options);
 };
}
module.exports={createNativeMoneyResolver,createJestMoneyResolver};
