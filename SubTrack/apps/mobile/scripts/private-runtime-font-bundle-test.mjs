import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(join(app,'package.json'));
const config=JSON.parse(readFileSync(join(app,'app.json'),'utf8')).expo;
const entry=config.plugins.find(plugin=>Array.isArray(plugin)&&plugin[0]==='expo-font');
const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');

test('actual pinned Android font plugin bundles only the six approved static files with exact bytes',async()=>{
 assert.ok(entry);assert.deepEqual(Object.keys(entry[1]),['android']);
 const manifest=JSON.parse(readFileSync(join(app,'assets/fonts/billing-month-fonts.json'),'utf8'));
 const expected=manifest.staticInstances.map(font=>font.file).sort();
 assert.deepEqual(entry[1].android.fonts.map(path=>basename(path)).sort(),expected);
 const root=mkdtempSync(join(tmpdir(),'subtrack-font-bundle-'));
 assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('subtrack-font-bundle-'));
 try{
  const plugin=require(join(dirname(require.resolve('expo-font/package.json')),'plugin/build/withFonts.js')).default;
  const applied=plugin({name:'SubTrack font fixture',slug:'subtrack-font-fixture',mods:{android:{dangerous:async config=>config}}},entry[1]);
  assert.equal(applied.mods.ios,undefined);
  await applied.mods.android.dangerous({...applied,modResults:{},modRequest:{projectRoot:app,platformProjectRoot:root,platform:'android',modName:'dangerous',introspect:false}});
  const bundled=join(root,'app/src/main/assets/fonts');assert.deepEqual(readdirSync(bundled).sort(),expected);
  for(const font of manifest.staticInstances){assert.equal(sha(join(bundled,font.file)),font.sha256);assert.equal(sha(join(bundled,font.file)),sha(join(app,'assets/fonts',font.file)));}
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('Android functional proof requires custom fonts before enrollment without weakening later original flows',()=>{
 const driver=readFileSync(join(app,'scripts/private-runtime-device.mjs'),'utf8');
 const guard="if(platform==='android')assert.equal(installedFontState,'custom','Approved Android custom fonts must be loaded');";
 assert.ok(driver.indexOf("await flow('identifier')")<driver.indexOf(guard));assert.ok(driver.indexOf(guard)<driver.indexOf("await flow('enroll-add'"));
 for(const phase of ['restart','edit-status','edit-status-api-restart','renewals','billing-month','bank-connect','bank-final'])assert.ok(readFileSync(join(app,`e2e/private-runtime-${phase}.yaml`),'utf8').includes('appId: se.subtrack.app'));
});
