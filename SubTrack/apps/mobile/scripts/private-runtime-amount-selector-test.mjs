import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import {Buffer} from 'node:buffer';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {URL} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {flowEnvironment} from './private-runtime-flow-env.mjs';
import {failedSaveObservations} from './private-runtime-save-probe.mjs';
const requireMobile=createRequire(new URL('../package.json',import.meta.url));
const ts=requireMobile('typescript');
const formatterSource=readFileSync(new URL('../../../packages/money/src/formatter.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(formatterSource,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}}).outputText;
const {formatMinorUnits}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const cases=[];
for(const locale of ['en','sv']){
 const env=flowEnvironment(locale),label=env.MAESTRO_EXPECTED_AMOUNT_LABEL;
 const actual=formatMinorUnits(12990n,'SEK',{locale,display:'code'});
 assert.ok(actual.includes('\u00a0'));
 // The old Node-only check succeeds while the actual Java engine rejects NBSP.
 const old=label+': 129,90\\s+SEK';
 assert.equal(new RegExp('^(?:'+old+')$').test(label+': '+actual),true);
 cases.push([old,label+': '+actual,false]);
 cases.push([env.MAESTRO_EXPECTED_AMOUNT,label+': '+actual,true]);
 for(const space of [' ','\u00a0','\u202f']){
  cases.push([env.MAESTRO_EXPECTED_AMOUNT,label+': 129,90'+space+'SEK',true]);
  cases.push([env.MAESTRO_MONTH_AMOUNT,'129,90'+space+'SEK',true]);
 }
 for(const wrong of ['129,91 SEK','129,900 SEK','129,90 EUR','129,90\tSEK','129,90\nSEK','129,90SEK']){
  cases.push([env.MAESTRO_EXPECTED_AMOUNT,label+': '+wrong,false]);
  cases.push([env.MAESTRO_MONTH_AMOUNT,wrong,false]);
 }
 cases.push([env.MAESTRO_EXPECTED_AMOUNT,'Wrong label: '+actual,false]);
 cases.push([env.MAESTRO_EXPECTED_AMOUNT,label+': '+actual+' extra',false]);
}
// The same fixed diagnostic patterns must use Java-compatible spacing too.
await failedSaveObservations({phase:'flow-enroll-add',diagnostic:{targets:['expected-amount'],commands:['wait-visible'],reasons:['assertion']},metadata:{metadata:'AVAILABLE',command:'ASSERT_CONDITION',target:'UNKNOWN',occurrence:'UNKNOWN',errorClass:'UNKNOWN'},labels:flowEnvironment(),observe:async()=>({version:1,markerHash:'a'.repeat(64),identityCount:1,profileCompleteCount:1,justMeCount:1,subscriptionCount:1,subscriptionDigest:'b'.repeat(64)}),run:async(stage,name,pattern)=>{
 const forms={'code-prefix-dot':'SEK SPACE129.90','code-suffix-dot':'129.90SPACESEK','code-prefix-comma':'SEKSPACE129,90','code-suffix-comma':'129,90SPACESEK','symbol-suffix-comma':'129,90SPACEkr','symbol-suffix-dot':'129.90SPACEkr'};
 for(const space of [' ','\u00a0','\u202f'])cases.push([pattern,'Expected amount: '+forms[name].replace('SPACE',space),true]);
 throw Error('Collect remaining fixed patterns');
}});
const root=mkdtempSync(join(tmpdir(),'subtrack-java-amount-'));
const binary=name=>process.env.JAVA_HOME?join(process.env.JAVA_HOME,'bin',name):name;
try{
 const source=join(root,'AmountSelectorRegression.java');
 writeFileSync(source,`import java.util.Base64;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
public class AmountSelectorRegression {
 public static void main(String[] args) {
  int flags=Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE|Pattern.DOTALL|Pattern.MULTILINE;
  for(int i=0;i<args.length;i+=3){
   String regex=new String(Base64.getDecoder().decode(args[i]),StandardCharsets.UTF_8);
   String text=new String(Base64.getDecoder().decode(args[i+1]),StandardCharsets.UTF_8);
   if(Pattern.compile(regex,flags).matcher(text).matches()!=Boolean.parseBoolean(args[i+2]))throw new AssertionError("Selector regression case "+(i/3));
  }
  System.out.println("Java selector checks PASS cases="+(args.length/3));
 }
}`);
 const compile=spawnSync(binary('javac'),['-d',root,source],{encoding:'utf8',timeout:30000});
 assert.equal(compile.status,0,'Java17 compiler required for actual Maestro regex regression');
 const args=cases.flatMap(([pattern,text,expected])=>[Buffer.from(pattern).toString('base64'),Buffer.from(text).toString('base64'),String(expected)]);
 const result=spawnSync(binary('java'),['-cp',root,'AmountSelectorRegression',...args],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr);
 console.log(result.stdout.trim());
}finally{rmSync(root,{recursive:true,force:true});}
const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
assert.ok(driver.includes('assertRenewalsReceipt(created);\n    assert.equal(created.activeSavedDateReadback,true);'));
assert.ok(driver.indexOf('created_row_expected_value=confirmed')<driver.indexOf("markPhase('api-restart')"));
