import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Buffer} from 'node:buffer';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import {observeRestartUi,restartUiPresence} from './private-runtime-restart-ui.mjs';
const labels={welcome:'Create account',verify:'Verify with BankID',manage:'Manage',month:'Billing Month'};
const xml=(body='<node text="Create account" content-desc="private-canary"/>')=>Buffer.from('<?xml version="1.0"?><hierarchy rotation="0">'+body+'</hierarchy>');
const receipt=()=>({version:1,markerHash:'a'.repeat(64),identityCount:1,profileCompleteCount:1,justMeCount:1,subscriptionCount:1,subscriptionDigest:'b'.repeat(64)});
const diagnostic={withheld:null,commands:['wait-visible'],reasons:['assertion'],targets:['bankid-verify'],metro:[],modules:[]};
const options=()=>({platform:'android',phase:'flow-restart',diagnostic,expected:receipt(),markerHash:'a'.repeat(64),labels,observe:async()=>receipt(),owned:async()=>true,capture:async()=>xml(),cleanup:async()=>true});
test('strict XML projects only catalog and fixed developer label presence',()=>{
 const result=restartUiPresence(xml(),labels);assert.equal(result.welcome,'present');assert.equal(result.verify,'unobserved');assert.equal(JSON.stringify(result).includes('private-canary'),false);assert.equal(Object.isFrozen(result),true);
 for(const [name,text] of Object.entries(labels))assert.equal(restartUiPresence(xml(`<node content-desc="${text}"/>`),labels)[name],'present');
 for(const text of ['Development servers','Recently opened','Open in development build','Developer menu','Reload app'])assert.equal(restartUiPresence(xml(`<node text="${text}"/>`),labels).developer,'present');
 for(const text of ['Unmatched Route','Page could not be found.',"This screen doesn't exist.",'Render Error','Uncaught Error'])assert.equal(restartUiPresence(xml(`<node text="${text}"/>`),labels).routeError,'present');
 assert.equal(restartUiPresence(xml('<node text="Just once"/><node text="Always"/>'),labels).linkChooser,'present');
 for(const text of ['Just once','Always'])assert.equal(restartUiPresence(xml(`<node text="${text}"/>`),labels).linkChooser,'unobserved');
 assert.equal(restartUiPresence(xml('<node text="A &amp; B"/>'),{...labels,welcome:'A & B'}).welcome,'present');
 for(const bytes of [null,'private-canary',Buffer.alloc(0),Buffer.alloc(1048577),Buffer.from('<hierarchy/>'),Buffer.from('<?xml?><hierarchy>'),xml('<!DOCTYPE node>'),xml('<node text="\ufffd"/>'),xml('<node>'),xml('<other/>')])assert.equal(restartUiPresence(bytes,labels),null);
 for(const value of [null,42,[],Object.create(null),{...labels,extra:'private-canary'},{},...Object.keys(labels).map(key=>({...labels,[key]:''})),{...labels,welcome:42},{...labels,welcome:'x'.repeat(257)}])assert.equal(restartUiPresence(xml(),value),null);
});
test('exact original failure, stable owned fixture and cleanup bind one observation',async()=>{
 for(const target of ['bankid-verify','welcome-create-account']){
  const bytes=xml(),events=[];
  const result=await observeRestartUi({...options(),diagnostic:{...diagnostic,targets:[target]},observe:async()=>{events.push('readback');return receipt();},owned:async()=>{events.push('owned');return true;},capture:async()=>{events.push('capture');return bytes;},cleanup:async()=>{events.push('cleanup');return true;}});
  assert.equal(result.welcome,'present');assert.deepEqual(events,['readback','owned','capture','readback','owned','cleanup']);assert.equal(bytes.every(value=>value===0),true);
 }
});
test('foreign eligibility and every receipt field reject before UI access',async()=>{
 const invalid=[{platform:'ios'},{phase:'flow-enroll-add'},{diagnostic:null},{labels:null},{labels:{}},{diagnostic:{...diagnostic,withheld:'unknown'}},...['commands','reasons','targets','metro','modules'].flatMap(key=>[{diagnostic:{...diagnostic,[key]:undefined}},{diagnostic:{...diagnostic,[key]:{}}},{diagnostic:{...diagnostic,[key]:['foreign']}}]),{expected:null},{expected:42},{expected:[]},{expected:Object.create(null)},{expected:{...receipt(),extra:'private-canary'}},...Object.keys(receipt()).map(key=>({expected:{...receipt(),[key]:null}})),{markerHash:null},{markerHash:'foreign'},{markerHash:'c'.repeat(64)},{expected:{...receipt(),subscriptionDigest:42}},{expected:{...receipt(),subscriptionDigest:'foreign'}}];
 for(const patch of invalid){let called=false;assert.equal(await observeRestartUi({...options(),...patch,observe:()=>{called=true;}}),null);assert.equal(called,false);}
});
test('changed state, unowned process, malformed capture and all failure paths withhold',async()=>{
 for(const patch of [{observe:async()=>null},{observe:async()=>({...receipt(),subscriptionDigest:'c'.repeat(64)})},{owned:async()=>false},{owned:async()=>{throw Error('private-canary');}},{capture:async()=>{throw Error('private-canary');}},{capture:async()=>null},{capture:async()=>Buffer.from('private-canary')},{cleanup:async()=>false},{cleanup:async()=>{throw Error('private-canary');}}])assert.equal(await observeRestartUi({...options(),...patch}),null);
 for(const changed of [null,{...receipt(),subscriptionDigest:'c'.repeat(64)}]){let reads=0;const bytes=xml();assert.equal(await observeRestartUi({...options(),observe:async()=>++reads===1?receipt():changed,capture:async()=>bytes}),null);assert.equal(bytes.every(value=>value===0),true);}
 let owns=0;assert.equal(await observeRestartUi({...options(),owned:async()=>++owns===1}),null);
});
test('actual producer uses original receipt, fresh owned device, bounded memory and exclusive cleanup',()=>{
 const driver=readFileSync(new URL('./private-runtime-device.mjs',import.meta.url),'utf8');
 for(const text of ['acceptedCreatedReceipt=before;','expected:acceptedCreatedReceipt','harness.readbackReceipt()','private-runtime-android.sh\',\'owned-device','randomUUID()','mkdir\',\'-m\',\'700','uiautomator\',\'dump\',\'--compressed','maxBuffer:1048576','rmdir'])assert.ok(driver.includes(text));
});
