import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {runInNewContext} from 'node:vm';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(join(app,'package.json'));
const config=JSON.parse(readFileSync(join(app,'app.json'),'utf8')).expo;
const entry=config.plugins.find(plugin=>Array.isArray(plugin)&&plugin[0]==='expo-font');
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');

// Inspect the approved static TTF name table without an additional font dependency.
function postScriptNames(bytes){
 assert.equal(bytes.readUInt32BE(0),0x00010000);const count=bytes.readUInt16BE(4);assert.ok(count>0&&count<=128);
 let table;
 for(let index=0;index<count;index++){const at=12+index*16;if(bytes.toString('ascii',at,at+4)==='name'){table={start:bytes.readUInt32BE(at+8),length:bytes.readUInt32BE(at+12)};break;}}
 assert.ok(table&&table.start+table.length<=bytes.length);const start=table.start,records=bytes.readUInt16BE(start+2),strings=start+bytes.readUInt16BE(start+4),names=new Set();
 assert.ok(records>0&&records<=256&&6+records*12<=table.length);
 for(let index=0;index<records;index++){const at=start+6+index*12,platform=bytes.readUInt16BE(at);if(bytes.readUInt16BE(at+6)!==6||![0,3].includes(platform))continue;
  const length=bytes.readUInt16BE(at+8),offset=strings+bytes.readUInt16BE(at+10);assert.ok(length>0&&length%2===0&&offset>=start&&offset+length<=start+table.length);
  names.add(Buffer.from(bytes.subarray(offset,offset+length)).swap16().toString('utf16le'));
 }
 return [...names];
}

test('actual pinned Android font plugin bundles only the six approved static files with exact bytes',async()=>{
 assert.ok(entry);assert.deepEqual(Object.keys(entry[1]),['android','ios']);
 const manifest=JSON.parse(readFileSync(join(app,'assets/fonts/billing-month-fonts.json'),'utf8'));
 const expected=manifest.staticInstances.map(font=>font.file).sort();
 assert.deepEqual(entry[1].android.fonts.map(path=>basename(path)).sort(),expected);
 const root=mkdtempSync(join(tmpdir(),'subtrack-font-bundle-'));
 assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('subtrack-font-bundle-'));
 try{
  const plugin=require(join(dirname(require.resolve('expo-font/package.json')),'plugin/build/withFonts.js')).default;
  const applied=plugin({name:'SubTrack font fixture',slug:'subtrack-font-fixture',mods:{android:{dangerous:async config=>config}}},entry[1]);
  assert.equal(typeof applied.mods.ios.infoPlist,'function');
  await applied.mods.android.dangerous({...applied,modResults:{},modRequest:{projectRoot:app,platformProjectRoot:root,platform:'android',modName:'dangerous',introspect:false}});
  const bundled=join(root,'app/src/main/assets/fonts');assert.deepEqual(readdirSync(bundled).sort(),expected);
  for(const font of manifest.staticInstances){assert.equal(sha(join(bundled,font.file)),font.sha256);assert.equal(sha(join(bundled,font.file)),sha(join(app,'assets/fonts',font.file)));}
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('actual pinned iOS plugin registers exact approved resources and their real PostScript names',async()=>{
 const manifest=JSON.parse(readFileSync(join(app,'assets/fonts/billing-month-fonts.json'),'utf8'));
 assert.deepEqual(entry[1].ios.fonts.map(file=>basename(file)).sort(),manifest.staticInstances.map(font=>font.file).sort());
 const plugin=require(join(dirname(require.resolve('expo-font/package.json')),'plugin/build/withFonts.js')).default;
 const applied=plugin({name:'SubTrack iOS font fixture',slug:'subtrack-ios-font-fixture'},entry[1]);
 assert.equal(typeof applied.mods.ios.xcodeproj,'function');
 const result=await applied.mods.ios.infoPlist({...applied,modResults:{UIAppFonts:['Existing.ttf']},modRequest:{projectRoot:app,platformProjectRoot:app,platform:'ios',modName:'infoPlist',introspect:false}});
 assert.deepEqual(result.modResults.UIAppFonts.sort(),['Existing.ttf',...manifest.staticInstances.map(font=>font.file)].sort());
 for(const font of manifest.staticInstances){const file=join(app,'assets/fonts',font.file);assert.equal(sha(file),font.sha256);assert.deepEqual(postScriptNames(readFileSync(file)),[font.postScriptName]);}
 const loaderRoot=dirname(require.resolve('expo-font/package.json'));
 const memory=readFileSync(join(loaderRoot,'src/memory.ts'),'utf8'),font=readFileSync(join(loaderRoot,'src/Font.ts'),'utf8'),native=readFileSync(join(loaderRoot,'ios/FontUtils.swift'),'utf8');
 assert.ok(memory.includes('ExpoFontLoader.getLoadedFonts()'));assert.ok(native.includes('Bundle.main.object(forInfoDictionaryKey: "UIAppFonts")'));assert.ok(native.includes('UIFont.fontNames(forFamilyName: fontFamilyName)'));
 assert.ok(font.indexOf('if (isLoaded(fontFamily))')<font.indexOf('const asset = getAssetForSource(source)'));
});

test('pinned Expo native font loader accepts bundled PostScript names without resolving or downloading assets',async()=>{
 const manifest=JSON.parse(readFileSync(join(app,'assets/fonts/billing-month-fonts.json'),'utf8')),names=manifest.staticInstances.map(font=>font.postScriptName);
 const fontRoot=dirname(require.resolve('expo-font/package.json')),babel=require('@babel/core'),expoRequire=createRequire(require.resolve('babel-preset-expo'));
 const commonjs=expoRequire('@babel/plugin-transform-modules-commonjs');let assets=0;
 const loader={getLoadedFonts:()=>names},memory=compiled('memory.js');
 function compiled(file){
  const module={exports:{}},code=babel.transformSync(readFileSync(join(fontRoot,'build',file),'utf8'),{babelrc:false,configFile:false,plugins:[commonjs]}).code;
  const imports={
   'expo-modules-core':{Platform:{OS:'ios'},CodedError:Error,UnavailabilityError:Error},
   './ExpoFontLoader':{default:loader,__esModule:true},
   './Font.types':{},'./server':{registerStaticFont:()=>assert.fail('Native font test entered server rendering')},
   './FontLoader':{getAssetForSource:()=>{assets++;throw Error('Unexpected font asset download');},loadSingleFontAsync:()=>assert.fail('Bundled font was downloaded')},
  };
  runInNewContext(code,{module,exports:module.exports,require:key=>{if(key==='./memory')return memory;assert.ok(Object.hasOwn(imports,key),`Unexpected pinned font import ${key}`);return imports[key];}},{timeout:1000});return module.exports;
 }
 const font=compiled('Font.js');
 assert.ok(names.every(name=>font.isLoaded(name)));await font.loadAsync(Object.fromEntries(names.map((name,index)=>[name,index+1])));assert.equal(assets,0);
 // The old arbitrary runtime alias is absent from native UIAppFonts and still needs an asset.
 assert.equal(font.isLoaded('Geist400'),false);await assert.rejects(font.loadAsync({Geist400:1}),/Unexpected font asset download/);assert.equal(assets,1);
});

test('native functional proof requires custom fonts before enrollment without weakening later original flows',()=>{
 const driver=readFileSync(join(app,'scripts/private-runtime-device.mjs'),'utf8');
 const guard="assert.equal(installedFontState,'custom',`Approved ${platform} custom fonts must be loaded`);";
 assert.ok(driver.indexOf("await flow('identifier')")<driver.indexOf(guard));assert.ok(driver.indexOf(guard)<driver.indexOf("await flow('enroll-add'"));
 for(const phase of ['restart','edit-status','edit-status-api-restart','renewals','billing-month','bank-connect','bank-final'])assert.ok(readFileSync(join(app,`e2e/private-runtime-${phase}.yaml`),'utf8').includes('appId: se.subtrack.app'));
});
