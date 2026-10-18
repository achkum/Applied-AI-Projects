import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {URL} from 'node:url';
import {maestroDevicePrefix} from './private-runtime-maestro-device.mjs';

const udid='01234567-89AB-CDEF-0123-456789ABCDEF';
const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');

test('iOS requires the exact owned simulator and global options precede any command',()=>{
 const prefix=maestroDevicePrefix('ios',{SUBTRACK_SIMULATOR_UDID:udid});
 assert.deepEqual(prefix,['--device',udid,'--platform','ios']);
 assert.equal(Object.isFrozen(prefix),true);
 assert.deepEqual([...prefix,'hierarchy'],['--device',udid,'--platform','ios','hierarchy']);
 for(const value of [undefined,null,17,'',udid.toLowerCase(),` ${udid}`,`${udid}\n`,`${udid},${udid}`,'--device private-canary']){
  assert.throws(()=>maestroDevicePrefix('ios',{SUBTRACK_SIMULATOR_UDID:value}),error=>error.message==='Owned iOS simulator identifier required');
 }
 assert.throws(()=>maestroDevicePrefix('ios'),/Owned iOS simulator identifier required/);
 assert.throws(()=>maestroDevicePrefix('web',{}),/Unsupported owned device platform/);
});

test('Android invocation remains unchanged and never reads an iOS identifier',()=>{
 const environment={get SUBTRACK_SIMULATOR_UDID(){throw Error('must not read');}};
 const prefix=maestroDevicePrefix('android',environment);
 assert.deepEqual(prefix,[]);assert.equal(Object.isFrozen(prefix),true);
});

test('actual normal-flow function binds iOS and preserves original final path, labels and Android arguments',async()=>{
 const start=driver.indexOf('  async function flow('),end=driver.indexOf('  function copyAcceptedScreenshots(',start);
 assert.ok(start>0&&end>start);
 const block=driver.slice(start,end);
 for(const platform of ['ios','android']){
  const calls=[],phases=[],labels={MAESTRO_CREATE_ACCOUNT:'Create account'};
  const ports={platform,join,app:'/owned/app',privateDir:'/owned/private',maestroPrefix:maestroDevicePrefix(platform,{SUBTRACK_SIMULATOR_UDID:udid}),labels,renewalDate:'2026-10-17',fixtureMonthLabels:()=>({MONTH:'October'}),initialIdentifierFlow:()=> 'private-runtime-identifier.yaml',markPhase:value=>phases.push(value),run:async(...args)=>calls.push(args)};
  const flow=new Function('ports',`const {platform,join,app,privateDir,maestroPrefix,labels,renewalDate,fixtureMonthLabels,initialIdentifierFlow,markPhase,run}=ports;${block};return flow;`)(ports);
  await flow('identifier',{OWNED:'fixed'});await flow('edit-status');
  for(const [index,name] of ['identifier','edit-status'].entries()){
   const [command,args,label,environment]=calls[index];
   assert.equal(command,'maestro');assert.equal(label,name);
   assert.deepEqual(args,[...ports.maestroPrefix,'test','--test-output-dir',join('/owned/private',name),join('/owned/app','e2e',`private-runtime-${name}.yaml`)]);
   assert.equal(args.at(-1),join('/owned/app','e2e',`private-runtime-${name}.yaml`));
   assert.deepEqual(environment,index===0?{...labels,OWNED:'fixed'}:labels);
  }
  assert.deepEqual(phases,['flow-identifier','flow-edit-status']);
 }
 // Invalid iOS ownership is rejected before fixture construction or compilation.
 const binding=driver.indexOf('const maestroPrefix = maestroDevicePrefix(platform, process.env);');
 assert.ok(binding>0&&binding<driver.indexOf('const configPath ='));
});

test('actual direct save probes bind the same device without changing timeout, flow, labels or fd cleanup',async()=>{
 const start=driver.indexOf('      const saveProbe = async ('),end=driver.indexOf('      const manualBefore =',start);
 assert.ok(start>0&&end>start);
 const block=driver.slice(start,end);
 for(const platform of ['ios','android'])for(const header of [false,true]){
  const calls=[],closed=[],maestroPrefix=maestroDevicePrefix(platform,{SUBTRACK_SIMULATOR_UDID:udid});
  const ports={join,privateDir:'/owned/private',app:'/owned/app',maestroPrefix,process:{env:{PUBLIC:'fixed'}},labels:{MAESTRO_PERSONAL_TITLE:'Manage'},openSync:()=>17,closeSync:fd=>closed.push(fd),readFileSync:()=> 'private log',spawn:(...args)=>{calls.push(args);const child=new EventEmitter();Promise.resolve().then(()=>child.emit('close',0));return child;}};
  const saveProbe=new Function('ports',`const {join,privateDir,app,maestroPrefix,process,labels,openSync,closeSync,readFileSync,spawn}=ports;${block};return saveProbe;`)(ports);
  assert.deepEqual(await saveProbe('owned-label',header,'owned-probe'),{exitCode:0,timedOut:false,log:'private log'});
  assert.equal(calls.length,1);assert.deepEqual(closed,[17]);
  const [command,args,options]=calls[0];
  assert.equal(command,'timeout');
  assert.deepEqual(args,['--signal=TERM','--kill-after=5s','20s','maestro',...maestroPrefix,'test','--test-output-dir',join('/owned/private','owned-probe'),join('/owned/app',header?'e2e/private-runtime-save-header.yaml':'e2e/private-runtime-save-probe.yaml')]);
  assert.deepEqual(options,{cwd:'/owned/app',env:{PUBLIC:'fixed',MAESTRO_SAVE_PROBE_LABEL:'owned-label',MAESTRO_PERSONAL_TITLE:'Manage'},stdio:['ignore',17,17]});
 }
});
