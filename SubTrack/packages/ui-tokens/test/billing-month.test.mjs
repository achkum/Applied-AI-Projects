import {URL} from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {validateContrast} from '../scripts/contrast.mjs';
const root=new URL('../',import.meta.url);
test('native billing palette/font roles are additive and all declared text contrast is AA',()=>{
 const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));const source=read('src/billing-month.native.json'),generated=read('generated/billing-month.native.json');assert.deepEqual(generated,source);assert.deepEqual(validateContrast(generated),[]);
 assert.equal(generated.color.dark['bg.canvas'],'#0D1214');assert.equal(generated.color.light['action.accent'],'#9C640A');assert.equal(generated.color.dark['action.accent'],'#EDB24E');
 assert.deepEqual(generated.typography.fontFamily,{ui:'Geist400','ui.medium':'Geist500','ui.semibold':'Geist600',display:'Bricolage700','display.semibold':'Bricolage600','display.bold':'Bricolage700','display.extraBold':'Bricolage800',mono:'Geist400'});
 const baseline=JSON.parse(readFileSync(new URL('../../../.sdlc/evidence/ST-247/legacy-token-baseline.json',import.meta.url),'utf8'));
 const checkoutBaseline=JSON.parse(readFileSync(new URL('../../../.sdlc/evidence/ST-247/legacy-token-checkout-baseline.json',import.meta.url),'utf8'));
 const expectedDigest=bytes=>{assert.equal(bytes.length,32);for(const byte of bytes)assert.ok(Number.isInteger(byte)&&byte>=0&&byte<=255);return Buffer.from(bytes);};
 assert.deepEqual(Object.keys(checkoutBaseline).sort(),Object.keys(baseline).sort());
 for(const [path,expected]of Object.entries(baseline)){
  const original=readFileSync(new URL('../../../'+path,import.meta.url));
  const canonical=Buffer.from(original.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
  assert.deepEqual(createHash('sha256').update(canonical).digest(),expectedDigest(expected));
  const checkoutBytes=expectedDigest(checkoutBaseline[path]);
  if(original.includes(Buffer.from('\r\n')))assert.deepEqual(createHash('sha256').update(original).digest(),checkoutBytes);
 }
 const pkg=read('package.json');assert.equal(pkg.exports['.'],'./generated/theme.native.json');assert.equal(pkg.exports['./tokens.css'],'./generated/tokens.css');assert.equal(pkg.exports['./billing-month'],'./generated/billing-month.native.json');
});
