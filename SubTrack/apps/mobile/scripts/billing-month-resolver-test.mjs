import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import {createRequire} from 'node:module';
import {existsSync,statSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const {createNativeMoneyResolver,createJestMoneyResolver}=require('./billing-month-resolver.cjs');
const origin=path.join(root,'packages/money/src/money.ts'),target=path.join(root,'packages/money/src/formatter.ts');
const expoConfig=require.resolve('@expo/metro-config/package.json',{paths:[require.resolve('expo/package.json')]});
const metroRequire=createRequire(expoConfig),native=metroRequire('metro-resolver').resolve;
assert.equal(metroRequire('metro-resolver/package.json').version,'0.83.3');
const context={originModulePath:origin,resolveRequest:native,sourceExts:['js','jsx','json','ts','tsx'],assetExts:new Set(['ttf','png']),preferNativePlatform:true,redirectModulePath:p=>p,doesFileExist:p=>existsSync(p)&&statSync(p).isFile(),getPackageForModule:()=>null,getPackage:()=>null,unstable_enablePackageExports:true,fileSystemLookup:p=>{try{const s=statSync(p);return {exists:true,type:s.isFile()?'f':'d',realPath:realpathSync(p)};}catch{return {exists:false};}}};
test('actual pinned native resolver fails original explicit JS edge and resolves only fixed native bridge',()=>{
 const bridge=createNativeMoneyResolver({origin,target});
 for(const platform of ['ios','android']){assert.throws(()=>native(context,'./formatter.js',platform),error=>error.constructor.name==='FailedToResolvePathError');assert.equal(native(context,'./formatter',platform).filePath,target);assert.equal(bridge(context,'./formatter.js',platform).filePath,target);}
});
test('all other origins/requests/platforms preserve existing captured and context delegation without recursion',()=>{
 const calls=[];const prior=(ctx,name,platform)=>{calls.push([ctx,name,platform]);return 'prior';},fallback=(...args)=>{calls.push(args);return 'fallback';};
 const bridge=createNativeMoneyResolver({origin,target,previous:prior}),ctx={originModulePath:origin,resolveRequest:fallback};
 assert.equal(bridge(ctx,'./formatter.js','ios'),'prior');assert.equal(calls.pop()[1],target);
 for(const [ctx,name,platform]of [[{originModulePath:origin},'./other.js','ios'],[{originModulePath:origin+'.other'},'./formatter.js','ios'],[{},'./formatter.js','ios'],[{originModulePath:origin},'./formatter.js','web'],[{originModulePath:origin},'./formatter.js',null]]){assert.equal(bridge(ctx,name,platform),'prior');assert.deepEqual(calls.pop(),[ctx,name,platform]);}
 const defaults=createNativeMoneyResolver({origin,target});assert.equal(defaults(ctx,'./other.js','android'),'fallback');assert.throws(()=>defaults({},'x','ios'));
 assert.throws(()=>defaults({resolveRequest:defaults},'x','ios'));
});
test('Jest only resolves the exact formatter specifier from Money source directory',()=>{
 const seen=[],options={basedir:path.dirname(origin),defaultResolver:(name,ctx)=>{seen.push([name,ctx]);return name;}};const resolve=createJestMoneyResolver({directory:path.dirname(origin),target});
 assert.equal(resolve('./formatter.js',options),target);assert.equal(resolve('./other.js',options),'./other.js');const other={...options,basedir:path.dirname(origin)+'other'};assert.equal(resolve('./formatter.js',other),'./formatter.js');assert.deepEqual(seen.at(-1),['./formatter.js',other]);
});

test('new analytics imports resolve the real Money implementation only from the two approved source files',()=>{
 const bridge=createNativeMoneyResolver({origin,target});
 for(const platform of ['android','ios'])for(const file of ['recurring-cost.ts','price-increase.ts']){
  const ctx={...context,originModulePath:path.join(path.dirname(origin),file)};
  assert.equal(bridge(ctx,'./money.js',platform).filePath,origin);
  assert.equal(bridge({...ctx,originModulePath:origin},'./formatter.js',platform).filePath,target);
 }
 const calls=[],prior=createNativeMoneyResolver({origin,target,previous:(...args)=>{calls.push(args);return 'prior';}});
 const unknown={originModulePath:path.join(path.dirname(origin),'unreviewed.ts')};
 assert.equal(prior(unknown,'./money.js','android'),'prior');assert.equal(calls[0][1],'./money.js');
 const resolve=createJestMoneyResolver({directory:path.dirname(origin),target}),options={basedir:path.dirname(origin),defaultResolver:name=>name};
 assert.equal(resolve('./money.js',options),origin);
 assert.equal(resolve('./money.js',{...options,basedir:path.dirname(origin)+'other'}),'./money.js');
});

test('actual Expo Metro config resolves the complete Money source dependency graph for both native platforms',()=>{
 // Expose Expo's already installed, pinned transitive dependencies to its config bootstrap.
 // This changes only this test process lookup, never dependencies or the app resolver.
 const Module=require('node:module'),old=process.env.NODE_PATH;
 process.env.NODE_PATH=path.dirname(path.dirname(require.resolve('expo/package.json',{paths:[path.join(root,'apps/mobile')]})));Module._initPaths();
 try{const config=require('../metro.config.js'),configured=config.resolver.resolveRequest;assert.equal(typeof configured,'function');
  const client=path.join(root,'apps/mobile/src/api/privateMobileBillingMonth.ts');
  for(const platform of ['ios','android']){
   const money=configured({...context,sourceExts:config.resolver.sourceExts,originModulePath:client},'../../../../packages/money/src/money',platform);assert.equal(money.filePath,origin);
   const formatter=configured({...context,sourceExts:config.resolver.sourceExts,originModulePath:money.filePath},'./formatter.js',platform);assert.equal(formatter.filePath,target);
  }
 }finally{if(old===undefined)delete process.env.NODE_PATH;else process.env.NODE_PATH=old;Module._initPaths();}
});
