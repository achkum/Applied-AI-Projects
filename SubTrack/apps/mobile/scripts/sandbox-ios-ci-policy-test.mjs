import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,realpathSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
import vm from 'node:vm';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,posix} from 'node:path';
import {selectNativeChangeScope} from './private-runtime-change-scope.mjs';
const require=createRequire(new URL('../package.json',import.meta.url));
const yaml=createRequire(require.resolve('expo/package.json'))('yaml');
const readWorkflow=name=>yaml.parse(readFileSync(new URL(`../../../../.github/workflows/${name}`,import.meta.url),'utf8'));
const document=()=>readWorkflow('subtrack-sandbox-build.yml');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
function policyContract(doc){
 assert.deepEqual(doc.permissions,{contents:'read'});assert.deepEqual(Object.keys(doc.jobs).sort(),['ios-archive-policy','unsigned-ios']);
 const policy=doc.jobs['ios-archive-policy'],archive=doc.jobs['unsigned-ios'];assert.equal(policy.if,"github.event_name == 'pull_request'");assert.equal(policy['runs-on'],'ubuntu-24.04');assert.equal(archive.if,"github.event_name == 'workflow_dispatch'");assert.equal(archive['runs-on'],'macos-15');
 assert.equal(policy.outputs,undefined);assert.equal(archive.outputs,undefined);
 const dependencyIndex=policy.steps.findIndex(step=>step.run?.includes('pnpm install --frozen-lockfile')),checks=policy.steps.findIndex(step=>step.run?.includes('sandbox-ios-ci-policy-test.mjs'));assert.ok(dependencyIndex>=0&&dependencyIndex<checks);
 const commands=policy.steps.map(step=>step.run??'').join('\n');for(const file of ['sandbox-app-config-test.mjs','private-runtime-native-resolve-test.mjs','sandbox-ios-build-intent-test.mjs','sandbox-ios-archive-payload-test.mjs','sandbox-ios-ci-policy-test.mjs'])assert.ok(commands.includes(file));assert.ok(commands.includes('bash -n tools/sandbox/build-ios.sh'));
 assert.doesNotMatch(commands,/xcodebuild|expo\s+prebuild|build-ios\.sh\s+(prepare|unsigned-archive)|ST250_IOS_(UNSIGNED_ARCHIVE|TOOLCHAIN_PREPARATION)_PASS|installable_ipa=true|signing=(signed|true)|archive(_built|_qualified)?=(true|pass)/i);
 for(const step of policy.steps){assert.equal(step['continue-on-error'],undefined);assert.equal(step.outputs,undefined);assert.ok(!step.uses?.includes('upload-artifact'));}
 for(const job of [policy,archive]){assert.equal(job.steps.find(step=>step.uses?.startsWith('actions/checkout@')).uses,'actions/checkout@11d5960a326750d5838078e36cf38b85af677262');assert.equal(job.steps.find(step=>step.uses?.startsWith('actions/setup-node@')).with['node-version'],'24.14.0');assert.ok(job.steps.some(step=>step.run?.includes('npm install --global pnpm@12.6.0')));assert.ok(job.steps.some(step=>step.run?.includes('pnpm install --frozen-lockfile')));assert.ok(!job.steps.some(step=>step.uses?.includes('upload-artifact')));}
 assert.deepEqual(doc.on.workflow_dispatch.inputs.source_head,{description:'Exact reviewed source commit matching the dispatch ref',required:true,type:'string'});
 assert.deepEqual(doc.on.workflow_dispatch.inputs.runtime_enabled,{description:'Enable only the private sandbox runtime in the unsigned payload',required:false,default:false,type:'boolean'});
 assert.deepEqual(doc.on.workflow_dispatch.inputs.build_number,{description:'Canonical positive build number, required when runtime is enabled',required:false,default:'',type:'string'});
 assert.equal(archive.env.SUBTRACK_SANDBOX_HTTPS_ORIGIN,'https://198.44.116.159');assert.equal(archive.env.SUBTRACK_APP_VARIANT,'sandbox');
 const runtime=new vm.Script(archive.env.SUBTRACK_SANDBOX_RUNTIME_ENABLED.replace(/^\$\{\{\s*|\s*\}\}$/g,''));for(const enabled of [false,true])assert.equal(runtime.runInNewContext({inputs:{runtime_enabled:enabled}},{timeout:1000}),String(enabled));
 const authority=archive.steps.findIndex(step=>step.name==='Require the exact reviewed manual source'),checkout=archive.steps.findIndex(step=>step.uses?.startsWith('actions/checkout@')),measure=archive.steps.findIndex(step=>step.name==='Verify checked-out source before archive preparation'),build=archive.steps.findIndex(step=>step.run==='bash tools/sandbox/build-ios.sh unsigned-archive');assert.ok(authority>=0&&authority<checkout&&checkout<measure&&measure<build);assert.equal(archive.steps[authority]['working-directory'],'${{ runner.temp }}');assert.equal(archive.steps[checkout].with.ref,'${{ inputs.source_head }}');assert.equal(archive.steps[checkout].with['persist-credentials'],false);
}
test('iPhone PR policy runs actual Linux configuration/intent/recipe checks without claiming an archive or IPA',()=>{policyContract(document());});

test('actual ordered PR path filters avoid archive-only native rebuilds while mixed and neighboring app changes retain full proof',()=>{
 const native=readWorkflow('subtrack-native-device-proof.yml'),archive=document(),nativePaths=native.on.pull_request.paths;
 const scripts=['sandbox-ios-archive-payload.mjs','sandbox-ios-archive-payload-test.mjs','sandbox-ios-ci-policy-test.mjs'].map(name=>`SubTrack/apps/mobile/scripts/${name}`);
 assert.deepEqual(nativePaths.filter(pattern=>pattern.startsWith('!')),scripts.map(path=>`!${path}`));
 for(const path of scripts)assert.ok(nativePaths.indexOf(`!${path}`)>nativePaths.indexOf('SubTrack/apps/mobile/**'));
 // GitHub applies ordered positive/negative patterns per path, then runs if any path remains included.
 const included=(paths,patterns)=>paths.some(path=>{let match=false;for(const pattern of patterns){const negative=pattern.startsWith('!');if(posix.matchesGlob(path,negative?pattern.slice(1):pattern))match=!negative;}return match;});
 const archiveOnly=[...scripts,'.github/workflows/subtrack-sandbox-build.yml','SubTrack/tools/sandbox/build-ios.sh','SubTrack/.sdlc/tasks/ST-253.md'];
 for(const paths of [...archiveOnly.map(path=>[path]),archiveOnly])assert.equal(included(paths,nativePaths),false);
 for(const path of scripts)assert.equal(included([path],archive.on.pull_request.paths),true);
 for(const path of ['SubTrack/apps/mobile/src/components/onboarding/NativePersonalScreen.tsx','SubTrack/apps/mobile/app.config.ts','SubTrack/apps/mobile/scripts/private-runtime-device.mjs','SubTrack/apps/mobile/scripts/sandbox-ios-archive-payload-new.mjs','SubTrack/apps/api/src/sandbox/sandbox-http.ts','SubTrack/packages/contracts/openapi.yaml','SubTrack/pnpm-lock.yaml','.github/workflows/subtrack-native-device-proof.yml']){
  for(const paths of [[path],[...archiveOnly,path]]){assert.equal(included(paths,nativePaths),true);assert.equal(selectNativeChangeScope(paths),'full');}
 }
 policyContract(archive);
});
test('workflow policy contract rejects accidental per-PR archive work and false archive/signing/IPA receipt claims',()=>{for(const mutate of [doc=>{doc.jobs['unsigned-ios'].if="github.event_name == 'pull_request'";},doc=>{doc.jobs['ios-archive-policy']['runs-on']='macos-15';},doc=>{doc.jobs['ios-archive-policy'].steps.push({run:'bash tools/sandbox/build-ios.sh unsigned-archive'});},doc=>{doc.jobs['ios-archive-policy'].steps.push({run:"printf 'ST250_IOS_UNSIGNED_ARCHIVE_PASS installable_ipa=true\\n'"});},doc=>{doc.jobs['ios-archive-policy'].outputs={archive_receipt:'pass'};},doc=>{doc.jobs['ios-archive-policy'].steps.push({uses:'actions/upload-artifact@unexpected'});},doc=>{doc.jobs['ios-archive-policy'].steps[0]['continue-on-error']=true;}]){const doc=document();mutate(doc);assert.throws(()=>policyContract(doc));}});
test('actual manual source guard accepts only its same-source dispatch and rejects PR, foreign repository and malformed/mismatched source',()=>{
 const doc=document(),archive=doc.jobs['unsigned-ios'],guard=archive.steps.find(step=>step.name==='Require the exact reviewed manual source'),head='a'.repeat(40);assert.equal(guard.env.ST_IOS_SOURCE,'${{ inputs.source_head }}');
 assert.equal(guard.env.ST_IOS_BUILD_NUMBER,'${{ inputs.build_number }}');
 const invoke=extra=>{const temporary=mkdtempSync(join(realpathSync(tmpdir()),'st253-ios-policy-')),output=join(temporary,'env');try{const result=spawnSync(bash,['--noprofile','--norc','-e','-o','pipefail','-c',guard.run],{cwd:root,env:{...process.env,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'achkum/Applied-AI-Projects',ST_IOS_SOURCE:head,GITHUB_SHA:head,SUBTRACK_SANDBOX_RUNTIME_ENABLED:'false',ST_IOS_BUILD_NUMBER:'',GITHUB_ENV:output,...extra},encoding:'utf8',timeout:5000});return {...result,exports:existsSync(output)?readFileSync(output,'utf8'):''};}finally{assert.equal(dirname(resolve(temporary)),realpathSync(tmpdir()));rmSync(temporary,{recursive:true,force:true});}};assert.equal(invoke({}).status,0);
 for(const extra of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REPOSITORY:'foreign/repo'},{ST_IOS_SOURCE:'b'.repeat(40)},{ST_IOS_SOURCE:'A'.repeat(40)},{ST_IOS_SOURCE:''},{ST_IOS_SOURCE:head+'\n'}]){const result=invoke(extra);assert.notEqual(result.status,0);assert.equal(result.stdout,'');}
 for(const enabled of ['true','false'])for(const number of ['1','2147483647']){const result=invoke({SUBTRACK_SANDBOX_RUNTIME_ENABLED:enabled,ST_IOS_BUILD_NUMBER:number});assert.equal(result.status,0);assert.equal(result.exports,`SUBTRACK_SANDBOX_VERSION_CODE=${number}\n`);}
 for(const extra of [{SUBTRACK_SANDBOX_RUNTIME_ENABLED:'true'},{SUBTRACK_SANDBOX_RUNTIME_ENABLED:'TRUE'},...['0','01','2147483648','1\n','99999999999','private-canary'].map(number=>({ST_IOS_BUILD_NUMBER:number}))]){const result=invoke(extra);assert.notEqual(result.status,0);assert.equal(result.exports,'');assert.equal(result.stdout,'');}
 const measured=archive.steps.find(step=>step.name==='Verify checked-out source before archive preparation'),actual=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();assert.equal(measured.env.ST_IOS_SOURCE,'${{ inputs.source_head }}');for(const [value,status]of [[actual,0],[head,1]]){const result=spawnSync(bash,['--noprofile','--norc','-e','-o','pipefail','-c',measured.run],{cwd:root,env:{...process.env,ST_IOS_SOURCE:value},encoding:'utf8',timeout:5000});assert.equal(result.status,status);}
});
test('independent full installed iOS simulator proof still compiles and exercises the actual app, while manual archive stays unsigned/uninstalled',()=>{
 const full=readWorkflow('subtrack-native-device-proof.yml'),job=full.jobs['installed-native'];assert.equal(job.needs,'select-proof');
 const expression=job.strategy.matrix.include.replace(/^\$\{\{\s*|\s*\}\}$/g,'').replace(/^fromJSON\(/,'JSON.parse(').replaceAll('needs.select-proof.',"needs['select-proof'].");
 const script=new vm.Script(expression),matrix=(event,scope,inputs={})=>JSON.parse(JSON.stringify(script.runInNewContext({github:event,needs:{'select-proof':{outputs:{scope}}},inputs},{timeout:1000})));
 const android={platform:'android',runner:'ubuntu-24.04',database_mode:'docker'},ios={platform:'ios',runner:'macos-15',database_mode:'local'};
 const pr={event_name:'pull_request',repository:'achkum/Applied-AI-Projects',event:{pull_request:{number:292,head:{repo:{full_name:'achkum/Applied-AI-Projects'},ref:'st/native-synthetic-bank'},base:{ref:'st/native-billing-month'}}}},manual={event_name:'workflow_dispatch'};
 assert.deepEqual(matrix(pr,'full'),[android,ios]);assert.deepEqual(matrix(pr,'profile'),[android]);
 for(const scope of ['full','ios-driver'])assert.deepEqual(matrix(manual,scope,{platform:'ios'}),[ios]);
 assert.deepEqual(matrix(manual,'full',{platform:'all'}),[android,ios]);assert.deepEqual(matrix(manual,'full',{platform:'android'}),[android]);
 assert.equal(job['runs-on'],'${{ matrix.runner }}');
 const setup=job.steps.find(step=>step.name==='iOS 26.2 / Xcode 26.2 simulator (Expo SDK54)');for(const expected of ['/Applications/Xcode_26.2.app',"'Xcode 26.2'",'com.apple.CoreSimulator.SimDeviceType.iPhone-17','com.apple.CoreSimulator.SimRuntime.iOS-26-2'])assert.ok(setup.run.includes(expected));
 assert.ok(job.steps.some(step=>step.run?.includes("node apps/mobile/scripts/private-runtime-device.mjs '${{ matrix.platform }}'")));
 const source=readFileSync(new URL('../../../tools/sandbox/build-ios.sh',import.meta.url),'utf8');assert.ok(source.includes('CODE_SIGNING_ALLOWED=NO archive'));assert.ok(source.includes('runtime_qualification=not-performed'));assert.ok(source.includes('installable_ipa=false'));assert.equal(document().jobs['unsigned-ios'].steps.filter(step=>step.run==='bash tools/sandbox/build-ios.sh unsigned-archive').length,1);
 const verify=source.indexOf('node scripts/sandbox-ios-archive-payload.mjs "$bundle" "$runtime_intent" "$build_number" "$source_head"');assert.ok(verify>source.indexOf('CODE_SIGNING_ALLOWED=NO archive')&&verify<source.indexOf("printf 'ST250_IOS_UNSIGNED_ARCHIVE_PASS"));assert.ok(source.includes('[[ "$(git rev-parse HEAD)" == "$source_head" ]]'));
});
