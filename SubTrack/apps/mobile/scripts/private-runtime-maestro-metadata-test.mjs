import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {projectEnrollmentMetadata,prepareEnrollmentMetadata,enrollmentMetadataLines} from './private-runtime-maestro-metadata.mjs';
import {createEnrollmentExecution} from './private-runtime-identifier-diagnostic.mjs';
const kinds=['tapOnElement','inputTextCommand','hideKeyboardCommand','assertConditionCommand','scrollUntilVisible','takeScreenshotCommand','applyConfigurationCommand'];
const row=(kind='tapOnElement',patch={})=>({command:{[kind]:{}},metadata:{status:'FAILED',sequenceNumber:1,depth:0,...patch}});
const bytes=value=>Buffer.from(JSON.stringify(value));
const prefix=(patch={})=>({command:{defineVariablesCommand:{env:{private:'private-canary'}}},metadata:{status:'COMPLETED',sequenceNumber:0,depth:0,...patch}});
const flowBytes=rows=>bytes([prefix(),...rows]);
const invalid=value=>assert.deepEqual(projectEnrollmentMetadata(value),{metadata:'INVALID',command:'UNKNOWN',errorClass:'UNKNOWN'});
function temporary(action){const base=fs.realpathSync(tmpdir()),root=fs.mkdtempSync(join(base,'st-c22-'));try{return action(root);}finally{mock.restoreAll();syncBuiltinESMExports();assert.equal(dirname(resolve(root)),base);assert.ok(basename(root).startsWith('st-c22-'));fs.rmSync(root,{recursive:true,force:true});}}
function fixture(root){const execution=createEnrollmentExecution('enroll-add'),reader=prepareEnrollmentMetadata(root,execution),flow=join(root,'enroll-add','2026-10-14_120000','private-runtime-enroll-add');fs.mkdirSync(flow,{recursive:true});const file=join(flow,'commands.json');fs.writeFileSync(file,flowBytes([row()]));execution.record('exit',1,null);return {execution,reader,flow,file};}
function replace(name,implementation){mock.method(fs,name,implementation);syncBuiltinESMExports();}
test('producer-shaped complete records select only one top-level failed original kind, no payload/class/stage inference',()=>{
 for(const [index,kind] of kinds.entries()){const value=projectEnrollmentMetadata(flowBytes([row('applyConfigurationCommand',{status:'COMPLETED'}),{...row(kind,{sequenceNumber:2,timestamp:1,duration:2,error:{message:'otp-private-canary',debugMessage:'Bearer private-canary'},evaluatedCommand:{inputTextCommand:{text:'private-canary'}},artifacts:[{type:'SCREENSHOT',path:'/private-canary/path'}]}),command:{[kind]:{text:'private-canary',selector:{textRegex:'private-canary'},fraction:0.5,true:true,false:false,null:null}}}]));assert.equal(value.metadata,'AVAILABLE');assert.equal(value.command,['TAP','INPUT','HIDE_KEYBOARD','ASSERT_CONDITION','SCROLL_UNTIL_VISIBLE','SCREENSHOT','CONFIGURATION'][index]);assert.equal(value.errorClass,'UNKNOWN');assert.ok(Object.isFrozen(value));assert.equal(JSON.stringify(value).includes('canary'),false);}
 for(const records of [[],[row('tapOnElement',{status:'COMPLETED'})],[row(),row('inputTextCommand',{sequenceNumber:2})]])assert.equal(projectEnrollmentMetadata(flowBytes(records)).metadata,'UNAVAILABLE');
});
test('strict UTF8, JSON duplicates including escaped aliases, depth/bounds/safe numbers and malformed syntax fail closed',()=>{
 for(const input of [null,Buffer.alloc(4*1024*1024+1),Buffer.from([0xc3,0x28]),Buffer.from('\ufeff[]'),...['','[','{"a":1,"a":2}','[{"command":{},"metadata":{},"metadata":{}}]','[{"command":{},"metadata":{"status":"FAILED","st\\u0061tus":"COMPLETED"}}]','{"a":true false}','{"a" 1}','{"a":1,}','[1 2]','"unterminated','"bad\\q"','"bad\ncontrol"','[undefined]','[1e999]','[9007199254740992]','[1]junk','['.repeat(33)+'null'+']'.repeat(33)].map(value=>Buffer.from(value))])invalid(input);
 assert.equal(projectEnrollmentMetadata(flowBytes([row('inputTextCommand'),row('tapOnElement',{status:'COMPLETED',sequenceNumber:2})])).metadata,'AVAILABLE');
 for(const payload of ['quoted " private-canary','escaped \\ private-canary','unicode ü private-canary'])assert.equal(projectEnrollmentMetadata(flowBytes([{...row(),command:{tapOnElement:{payload}}}])).metadata,'AVAILABLE');
 invalid(bytes(Array.from({length:129},(_,index)=>row('tapOnElement',{sequenceNumber:index,status:'COMPLETED'}))));
});
test('complete exact schema rejects every unsupported shape, status, key, sequence and nested failure',()=>{
 const bad=[{},null,1,[null],[1],[{...row(),extra:true}],[{command:[],metadata:row().metadata}],[{command:{unknown:{}},metadata:row().metadata}],[{command:{tapOnElement:{},inputTextCommand:{}},metadata:row().metadata}],[{command:{tapOnElement:null},metadata:row().metadata}],[{command:row().command,metadata:[]}],[row('tapOnElement',{extra:true})],[row('tapOnElement',{status:'private-canary'})],[row('tapOnElement',{sequenceNumber:-1})],[row('tapOnElement',{depth:33})],[row('tapOnElement',{depth:1})],[row('tapOnElement',{timestamp:-1})],[row('tapOnElement',{duration:'private-canary'})],[row('tapOnElement',{evaluatedCommand:[]})],[row('tapOnElement',{error:null})],[row('tapOnElement',{error:{class:'AssertionFailure'}})],[row('tapOnElement',{error:{message:1}})],[row('tapOnElement',{artifacts:null})],[row('tapOnElement',{artifacts:[null]})],[row('tapOnElement',{artifacts:[{type:'SCREENSHOT',path:'private',extra:true}]})],[row('tapOnElement',{artifacts:[{type:1,path:'private'}]})],[row('tapOnElement',{artifacts:[{type:'SCREENSHOT',path:1}]})],[row('tapOnElement',{sequenceNumber:1}),row('inputTextCommand',{sequenceNumber:1})],[row('tapOnElement',{sequenceNumber:2}),row('inputTextCommand',{sequenceNumber:1})]];
 for(const value of bad)invalid(Array.isArray(value)?flowBytes(value):bytes(value));
});
test('fresh invocation reader is failure-only, bounded and refuses missing/ambiguous/different flow ownership',()=>{
 temporary(root=>{const {reader}=fixture(root);assert.equal(reader.read('flow-identifier'),null);assert.equal(reader.read('flow-enroll-add').metadata,'AVAILABLE');});
 temporary(root=>{const execution=createEnrollmentExecution('enroll-add'),reader=prepareEnrollmentMetadata(root,execution);assert.equal(reader.read('flow-enroll-add'),null);execution.record('exit',0,null);assert.equal(reader.read('flow-enroll-add'),null);});
 temporary(root=>{const reader=prepareEnrollmentMetadata(root,{snapshot(){throw Error('private-canary');}});assert.equal(reader.read('flow-enroll-add'),null);});
 temporary(root=>{const {reader,file}=fixture(root);fs.unlinkSync(file);assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const {reader,file}=fixture(root);fs.writeFileSync(file,'');assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');fs.writeFileSync(file,Buffer.alloc(4*1024*1024+1));assert.equal(reader.read('flow-enroll-add').metadata,'INVALID');});
 temporary(root=>{const {reader,file}=fixture(root);fs.unlinkSync(file);fs.mkdirSync(file);assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const execution=createEnrollmentExecution('enroll-add');fs.mkdirSync(join(root,'enroll-add'));const reader=prepareEnrollmentMetadata(root,execution);execution.record('exit',1,null);assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const execution=createEnrollmentExecution('enroll-add'),reader=prepareEnrollmentMetadata(root,execution);execution.record('error');assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const {reader}=fixture(root);fs.mkdirSync(join(root,'enroll-add','2026-10-14_120001'));assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const {reader}=fixture(root);fs.renameSync(join(root,'enroll-add','2026-10-14_120000'),join(root,'enroll-add','private-canary'));assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const {reader}=fixture(root);const stamp=join(root,'enroll-add','2026-10-14_120000');fs.renameSync(join(stamp,'private-runtime-enroll-add'),join(stamp,'another-flow'));assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const {reader}=fixture(root);for(let i=0;i<33;i++)fs.writeFileSync(join(root,'enroll-add','private-'+i),'');assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
});
test('exact line grammar cannot upgrade malformed/duplicate/injected status; error class always UNKNOWN',()=>{
 assert.deepEqual(enrollmentMetadataLines(projectEnrollmentMetadata(flowBytes([row()]))),['enrollment-structured-metadata=AVAILABLE','enrollment-failed-command=TAP','enrollment-error-class=UNKNOWN']);
 for(const value of [null,[],{metadata:'AVAILABLE',command:'UNKNOWN',errorClass:'UNKNOWN'},{metadata:'UNAVAILABLE',command:'TAP',errorClass:'UNKNOWN'},{metadata:'INVALID',command:'private-canary',errorClass:'UNKNOWN'},{metadata:'private-canary',command:'UNKNOWN',errorClass:'UNKNOWN'},{metadata:'INVALID',command:'UNKNOWN',errorClass:'AssertionFailure'},{metadata:'INVALID',command:'UNKNOWN',errorClass:'UNKNOWN',extra:true}])assert.equal(enrollmentMetadataLines(value),null);
 assert.deepEqual(enrollmentMetadataLines(projectEnrollmentMetadata(Buffer.from('private-canary'))),['enrollment-structured-metadata=INVALID','enrollment-failed-command=UNKNOWN','enrollment-error-class=UNKNOWN']);
});
test('actual bounded tree symlinks and changed inode/path/open/read fences never upgrade ownership',()=>{
 temporary(root=>{const file=join(root,'not-directory');fs.writeFileSync(file,'');const execution=createEnrollmentExecution('enroll-add'),reader=prepareEnrollmentMetadata(file,execution);execution.record('error');assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const {reader}=fixture(root),original=fs.lstatSync;replace('lstatSync',(path,options)=>{const stat=original(path,options);return resolve(path)===resolve(root)?Object.assign(Object.create(Object.getPrototypeOf(stat)),stat,{ino:stat.ino+1n}):stat;});assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const {reader,flow}=fixture(root);const target=join(root,'target');fs.mkdirSync(target);fs.symlinkSync(target,join(flow,'foreign-link'),'junction');assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const {reader,file}=fixture(root),original=fs.realpathSync;replace('realpathSync',path=>path===file?join(root,'foreign'):original(path));assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const {reader}=fixture(root),original=fs.fstatSync;replace('fstatSync',(fd,options)=>{const stat=original(fd,options);return Object.assign(Object.create(Object.getPrototypeOf(stat)),stat,{ino:stat.ino+1n});});assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
 temporary(root=>{const {reader,file}=fixture(root),original=fs.readFileSync;replace('readFileSync',(...args)=>{const value=original(...args);fs.writeFileSync(file,'changed');return value;});assert.equal(reader.read('flow-enroll-add').metadata,'UNAVAILABLE');});
});

test('pinned producer requires exactly one completed initial top-level private definition prelude',()=>{
 const completed=prefix({timestamp:1,duration:2,evaluatedCommand:{defineVariablesCommand:{env:{private:'private-canary'}}},error:{message:'private-canary',debugMessage:'private-canary'},artifacts:[{type:'SCREENSHOT',path:'private-canary'}]});
 const production=[completed,row('applyConfigurationCommand',{status:'COMPLETED'}),row('inputTextCommand',{status:'COMPLETED',sequenceNumber:2}),row('assertConditionCommand',{sequenceNumber:3})];
 assert.deepEqual(projectEnrollmentMetadata(bytes(production)),{metadata:'AVAILABLE',command:'ASSERT_CONDITION',errorClass:'UNKNOWN'});
 assert.equal(JSON.stringify(enrollmentMetadataLines(projectEnrollmentMetadata(bytes(production)))).includes('canary'),false);
 for(const value of [[],[row()],[row('applyConfigurationCommand',{status:'COMPLETED'}),row('tapOnElement',{sequenceNumber:2})],
  [prefix({status:'FAILED'}),row()], [prefix({status:'PENDING'}),row()], [prefix({status:'RUNNING'}),row()], [prefix({status:'WARNED'}),row()], [prefix({status:'SKIPPED'}),row()], [prefix({status:'unknown'}),row()],
  [prefix({depth:1}),row()], [prefix({depth:33}),row()], [prefix({sequenceNumber:-1}),row()], [prefix({sequenceNumber:1}),row()], [prefix({timestamp:-1}),row()], [prefix({duration:'private-canary'}),row()],
  [prefix({extra:true}),row()], [prefix({evaluatedCommand:[]}),row()], [prefix({error:{class:'private-canary'}}),row()], [prefix({artifacts:[null]}),row()],
  [{...prefix(),command:null},row()], [{...prefix(),command:[]},row()], [{...prefix(),command:{}},row()], [{...prefix(),command:{unknown:{}}},row()],
  [{...prefix(),command:{defineVariablesCommand:null}},row()], [{...prefix(),command:{defineVariablesCommand:[]}},row()], [{...prefix(),command:{defineVariablesCommand:{},tapOnElement:{}}},row()],
  [prefix(),prefix({sequenceNumber:1}),row('tapOnElement',{sequenceNumber:2})], [prefix(),row('tapOnElement',{status:'COMPLETED'}),prefix({sequenceNumber:2}),row('tapOnElement',{sequenceNumber:3})]])invalid(bytes(value));
 const missing=prefix();delete missing.metadata.status;invalid(bytes([missing,row()]));
 const missingSequence=prefix();delete missingSequence.metadata.sequenceNumber;invalid(bytes([missingSequence,row()]));
 const missingDepth=prefix();delete missingDepth.metadata.depth;invalid(bytes([missingDepth,row()]));
 invalid(Buffer.from('[{"command":{"defineVariablesCommand":{},"defineVariablesCommand":{}},"metadata":{"status":"COMPLETED","sequenceNumber":0,"depth":0}}]'));
 invalid(bytes([prefix(),row('defineVariablesCommand')]));
});
