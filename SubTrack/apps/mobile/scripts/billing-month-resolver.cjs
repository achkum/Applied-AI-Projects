/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro and Jest resolver hooks are loaded as CommonJS. */
/* Native exact-edge compatibility; shared Money implementation is unchanged. */
const path=require('node:path');
function createNativeMoneyResolver({origin,target,previous}){
 return function nativeMoneyResolver(context,request,platform){
  const delegate=previous??context.resolveRequest;
  if(typeof delegate!=='function'||delegate===nativeMoneyResolver)throw new Error('Missing upstream Money resolver');
  const scoped=(platform==='ios'||platform==='android')&&typeof context.originModulePath==='string'&&path.resolve(context.originModulePath)===origin&&request==='./formatter.js';
  return delegate(context,scoped?target:request,platform);
 };
}
function createJestMoneyResolver({directory,target}){
 return function jestMoneyResolver(request,options){
  // Jest exposes the importing directory, not an origin filename; this exact Money directory/specifier maps the same one dependency.
  return options.defaultResolver(request==='./formatter.js'&&path.resolve(options.basedir)===directory?target:request,options);
 };
}
module.exports={createNativeMoneyResolver,createJestMoneyResolver};
