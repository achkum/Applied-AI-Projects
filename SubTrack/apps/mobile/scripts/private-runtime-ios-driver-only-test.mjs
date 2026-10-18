import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {URL,fileURLToPath} from 'node:url';
import process from 'node:process';
import test from 'node:test';
import vm from 'node:vm';

const require=createRequire(new URL('../package.json',import.meta.url));
const yaml=createRequire(require.resolve('expo/package.json'))('yaml');
const workflow=yaml.parse(readFileSync(new URL('../../../../.github/workflows/subtrack-native-device-proof.yml',import.meta.url),'utf8'));
const select=workflow.jobs['select-proof'].steps.find(step=>step.id==='select'),job=workflow.jobs['installed-native'];
const step=name=>{const found=job.steps.find(item=>item.name===name);assert.ok(found,name);return found;};
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const authority={ST_PROOF_EVENT:'workflow_dispatch',ST_PROOF_REQUESTED:'ios-driver',ST_PROOF_PLATFORM:'ios',ST_PROOF_SOURCE:head,GITHUB_REPOSITORY:'achkum/Applied-AI-Projects',GITHUB_REF:'refs/heads/codex/ios-startup-fixes',GITHUB_SHA:head};
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
function selectScope(patch={}){
 const output=join(tmpdir(),`st253-ios-driver-only-${randomUUID()}.txt`);writeFileSync(output,'',{mode:0o600,flag:'wx'});
 try{
  const result=spawnSync(bash,['-e','-o','pipefail','-c',select.run],{cwd:repo,env:{...process.env,...authority,...patch,GITHUB_OUTPUT:output.replaceAll('\\','/')},encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);
  return {status:result.status,output:readFileSync(output,'utf8')};
 }finally{unlinkSync(output);}
}
function evaluate(expression,context){
 const source=expression.replace(/^\$\{\{\s*|\s*\}\}$/g,'').replaceAll('needs.select-proof.',"needs['select-proof'].");
 return new vm.Script(source).runInNewContext(context,{timeout:1000});
}

test('actual manual selection accepts isolated driver mode only at exact iOS repository/ref/source authority',()=>{
 assert.deepEqual(workflow.on.workflow_dispatch.inputs.proof_scope.options,['profile','full','ios-driver']);
 assert.deepEqual(selectScope(),{status:0,output:'scope=ios-driver\nselection=manual\n'});
 for(const patch of [{ST_PROOF_EVENT:'push'},{ST_PROOF_PLATFORM:'android'},{ST_PROOF_PLATFORM:'all'},{GITHUB_REPOSITORY:'fork/repository'},{GITHUB_REF:'refs/heads/other'},{ST_PROOF_SOURCE:'a'.repeat(40)},{GITHUB_SHA:'a'.repeat(40)},{ST_PROOF_SOURCE:''}]){
  const result=selectScope(patch);assert.notEqual(result.status,0);assert.equal(result.output,'');
 }
});

test('existing manual full/profile selection stays available and signed-product mode cannot consume driver-only intent',()=>{
 for(const [scope,platform] of [['full','ios'],['full','android'],['full','all'],['profile','android']])assert.deepEqual(selectScope({ST_PROOF_REQUESTED:scope,ST_PROOF_PLATFORM:platform}),{status:0,output:`scope=${scope}\nselection=manual\n`});
 const signed=workflow.jobs['final-signed-authority'];assert.equal(signed.env.ST_FINAL_SCOPE,'${{ inputs.proof_scope }}');
 const script=signed.steps[0].run;
 for(const scope of ['ios-driver','profile','full']){
  const result=spawnSync(bash,['-e','-c',script],{cwd:repo,env:{...process.env,...authority,GITHUB_REF:'refs/heads/st/native-synthetic-bank',ST_FINAL_SOURCE:head,ST_FINAL_TOOLING:head,ST_FINAL_SCOPE:scope},encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status===0,scope!=='ios-driver');
 }
 for(const tooling of ['',undefined,'foreign',head==='a'.repeat(40)?'b'.repeat(40):'a'.repeat(40)]){
  const result=spawnSync(bash,['-e','-c',script],{cwd:repo,env:{...process.env,...authority,GITHUB_REF:'refs/heads/st/native-synthetic-bank',ST_FINAL_SOURCE:head,ST_FINAL_TOOLING:tooling,ST_FINAL_SCOPE:'full'},encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.notEqual(result.status,0);
 }
});

test('driver success still skips PostgreSQL, fixture, app compile/proof and native acceptance upload',()=>{
 for(const scope of ['ios-driver','full','profile']){
  const context={needs:{'select-proof':{outputs:{scope}}},success:()=>true};
  for(const name of ['Owned PostgreSQL16 and ephemeral TLS fixture','Installed workflow, API restart, same database row and logout','Sanitized native evidence only'])assert.equal(evaluate(step(name).if,context),scope!=='ios-driver');
 }
 assert.equal(evaluate(step('Owned iOS driver readiness before native compilation').if,{matrix:{platform:'ios'}}),true);
 const preflight=job.steps.indexOf(step('Owned iOS driver readiness before native compilation'));
 assert.ok(preflight<job.steps.indexOf(step('Owned PostgreSQL16 and ephemeral TLS fixture')));
 const nativeCalls=job.steps.filter(item=>/private-runtime-device\.mjs|private-runtime-build\.sh|private-mobile-proof\.sh start|brew install postgresql@16/.test(item.run??''));
 assert.equal(nativeCalls.length,2);for(const item of nativeCalls)assert.equal(evaluate(item.if,{needs:{'select-proof':{outputs:{scope:'ios-driver'}}}}),false);
 const tools=step('Locked dependencies and proof tools');assert.ok(tools.run.includes('node --test apps/mobile/scripts/private-runtime-ios-driver-only-test.mjs'));
});

test('driver-only capture remains exact manual authority and exposes only existing recipient ciphertext',()=>{
 const github={event_name:'workflow_dispatch',repository:authority.GITHUB_REPOSITORY,ref:authority.GITHUB_REF,sha:head,event:{}};
 const inputs={platform:'ios',proof_scope:'ios-driver',source_head:head};
 const enabled=(g=github,i=inputs,p='ios')=>evaluate(job.env.ST253_CAPTURE_ENABLED,{github:g,inputs:i,matrix:{platform:p}});
 assert.equal(enabled(),'true');assert.equal(enabled(github,{...inputs,proof_scope:'full'}),'true');
 for(const [g,i,p] of [[{...github,repository:'foreign/repository'},inputs,'ios'],[{...github,ref:'refs/heads/other'},inputs,'ios'],[github,{...inputs,source_head:'b'.repeat(40)},'ios'],[github,{...inputs,platform:'all'},'ios'],[github,{...inputs,proof_scope:'profile'},'ios'],[github,inputs,'android']])assert.equal(enabled(g,i,p),'false');
 const upload=step('Recipient-encrypted pre-app iOS tool failure only');
 assert.equal(upload.if,"failure() && steps.sealed_ios_driver.outputs.ready == 'true'");
 assert.equal(upload.with.path,'${{ runner.temp }}/subtrack-native-proof/sealed/ios-driver-preflight.st253sealed');
 assert.equal(upload.with['retention-days'],1);
 assert.equal(step('Owned fixture and debug server cleanup').if,'always()');
 assert.ok(step('Owned fixture and debug server cleanup').run.includes('xcrun simctl delete "$SUBTRACK_SIMULATOR_UDID"'));
});
