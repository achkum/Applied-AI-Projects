import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {URL,fileURLToPath} from 'node:url';
import {verifyIosFontBundle} from './private-runtime-ios-font-bundle.mjs';
const source=fileURLToPath(new URL('../assets/fonts/',import.meta.url)),fonts=JSON.parse(readFileSync(join(source,'billing-month-fonts.json'),'utf8')).staticInstances;
test('compiled iOS bundle requires exact approved resources and UIAppFonts before native install',()=>{
 const root=mkdtempSync(join(realpathSync(tmpdir()),'subtrack-ios-fonts-'));
 try{
  writeFileSync(join(root,'Info.plist'),'opaque plist');for(const font of fonts)copyFileSync(join(source,font.file),join(root,font.file));
  const plist={CFBundleIdentifier:'se.subtrack.app',UIAppFonts:fonts.map(font=>font.file)};
  assert.equal(verifyIosFontBundle(root,()=>plist),true);
  for(const value of [{...plist,CFBundleIdentifier:'foreign'}, {...plist,UIAppFonts:plist.UIAppFonts.slice(1)}, {...plist,UIAppFonts:[...plist.UIAppFonts,plist.UIAppFonts[0]]}])assert.throws(()=>verifyIosFontBundle(root,()=>value));
  writeFileSync(join(root,fonts[0].file),'incorrect native asset');assert.throws(()=>verifyIosFontBundle(root,()=>plist));
 }finally{rmSync(root,{recursive:true,force:true});}
});
