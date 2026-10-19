import {execFileSync} from 'node:child_process';
import {Buffer} from 'node:buffer';
import {mkdirSync,lstatSync,realpathSync,readdirSync,openSync,fstatSync,readSync,readFileSync,closeSync,constants,writeFileSync,unlinkSync,rmdirSync,existsSync,readlinkSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import process from 'node:process';
import {createHash,createPublicKey,createCipheriv,publicEncrypt,randomBytes,randomUUID,constants as cryptoConstants} from 'node:crypto';
import {inflateSync,crc32} from 'node:zlib';
import {setImmediate} from 'node:timers/promises';
import {TextDecoder} from 'node:util';
const MAX_BYTES=4*1024*1024;
const KINDS=Object.freeze({tapOnElement:'TAP',inputTextCommand:'INPUT',hideKeyboardCommand:'HIDE_KEYBOARD',assertConditionCommand:'ASSERT_CONDITION',scrollUntilVisible:'SCROLL_UNTIL_VISIBLE',takeScreenshotCommand:'SCREENSHOT',applyConfigurationCommand:'CONFIGURATION',runFlowCommand:'SUBFLOW'});
const STATUSES=['PENDING','RUNNING','COMPLETED','FAILED','WARNED','SKIPPED'];
const TARGETS=Object.freeze(['personal-title','profile-save','add-open','subscription-name','subscription-category','subscription-amount','date-field','subscription-save','saved-row','verification-entry','profile-name','profile-title','mode-choice','home-en','home-sv','saved-ack','saved-amount','preferences-sv','preferences-en','UNKNOWN']);
export const ENROLLMENT_HEADER_OCCURRENCES=Object.freeze(['ENTRY_HEADER','SAVED_HEADER','UNKNOWN']);
const closed=(metadata,command='UNKNOWN',target='UNKNOWN',occurrence='UNKNOWN')=>Object.freeze({metadata,command,target,occurrence,errorClass:'UNKNOWN'});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
function strictJson(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_BYTES)throw Error('invalid');
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);let at=0;
 const space=()=>{while(at<text.length&&/[ \t\r\n]/.test(text[at]))at++;};
 function string(){if(text[at]!=='"')throw Error('invalid');const start=at++;
  while(at<text.length){if(text[at]==='\\'){at+=2;continue;}if(text[at++]==='"')return JSON.parse(text.slice(start,at));}
  throw Error('invalid');
 }
 function value(depth){space();const char=text[at];
  if(char==='{'||char==='['){if(depth>=32)throw Error('invalid');const object=char==='{',result=object?Object.create(null):[],keys=new Set();at++;space();const end=object?'}':']';
   if(text[at]!==end)while(true){if(object){const key=string();if(keys.has(key))throw Error('invalid');keys.add(key);space();if(text[at++]!==':')throw Error('invalid');result[key]=value(depth+1);}else result.push(value(depth+1));space();if(text[at]===end)break;if(text[at++]!==',')throw Error('invalid');space();}
   at++;return result;
  }
  if(char==='"')return string();
  for(const [token,literal] of [['true',true],['false',false],['null',null]])if(text.startsWith(token,at)){at+=token.length;return literal;}
  const match=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at));if(!match)throw Error('invalid');at+=match[0].length;const number=Number(match[0]);if(!Number.isFinite(number)||(Number.isInteger(number)&&!Number.isSafeInteger(number)))throw Error('invalid');return number;
 }
 const result=value(0);space();if(at!==text.length)throw Error('invalid');return result;
}
function commandKind(command){if(!plain(command))throw Error('invalid');const keys=Object.keys(command);if(keys.length!==1||!Object.hasOwn(KINDS,keys[0])||!plain(command[keys[0]]))throw Error('invalid');return KINDS[keys[0]];}
// Pinned original commands retain source selectors; evaluatedCommand and prose never supply a target.
function scrollTarget(command){
 const scroll=command.scrollUntilVisible;if(!plain(scroll)||!plain(scroll.selector))return 'UNKNOWN';
 const selector=scroll.selector,keys=Object.keys(selector);
 if(keys.some(key=>!['idRegex','textRegex','optional','size','below','above','leftOf','rightOf','containsChild','containsDescendants','traits','index','enabled','selected','checked','focused','childOf','css'].includes(key)||(!['idRegex','textRegex'].includes(key)&&selector[key]!==null&&!(key==='optional'&&selector[key]===false))))return 'UNKNOWN';
 const id=selector.idRegex??null,text=selector.textRegex??null;
 if(id!==null&&text!==null)return 'UNKNOWN';
 const ids=Object.freeze({'native-personal-title':'personal-title','native-subscription-name':'subscription-name','native-subscription-category':'subscription-category','native-subscription-amount':'subscription-amount','native-subscription-date':'date-field'});
 const texts=Object.freeze({'${MAESTRO_SAVE_PROFILE}':'profile-save','${MAESTRO_ADD}':'add-open','${MAESTRO_CATEGORY}':'subscription-category','${MAESTRO_SAVE_SUBSCRIPTION}':'subscription-save','Example streaming':'saved-row'});
 const target=typeof id==='string'&&Object.hasOwn(ids,id)?ids[id]:typeof text==='string'&&Object.hasOwn(texts,text)?texts[text]:'UNKNOWN';
 return target!=='UNKNOWN'&&scroll.direction===(target==='personal-title'?'UP':'DOWN')?target:'UNKNOWN';
}
// Original producer selectors only. Fixed labels cannot disclose entered values or grant capture authority.
const ASSERT_TARGETS=new Map([
 [{textRegex:'${MAESTRO_VERIFY_BANKID}'},'verification-entry'],[{textRegex:'${MAESTRO_PROFILE_NAME}'},'profile-name'],[{idRegex:'native-profile-name'},'profile-name'],
 [{idRegex:'native-personal-title',textRegex:'${MAESTRO_PROFILE_TITLE}'},'profile-title'],[{idRegex:'native-personal-title',textRegex:'${MAESTRO_PERSONAL_TITLE}'},'personal-title'],
 [{textRegex:'${MAESTRO_JUST_ME}'},'mode-choice'],[{textRegex:'${MAESTRO_MONTH_TITLE}'},'home-en'],[{textRegex:'${MAESTRO_SV_MONTH_TITLE}'},'home-sv'],
 [{textRegex:'${MAESTRO_ADD}'},'add-open'],[{textRegex:'${MAESTRO_SAVE_SUBSCRIPTION}',enabled:true},'subscription-save'],
 [{textRegex:'${MAESTRO_SAVED}'},'saved-ack'],[{textRegex:'Example streaming'},'saved-row'],[{textRegex:'${MAESTRO_EXPECTED_AMOUNT}'},'saved-amount'],
 [{textRegex:'${MAESTRO_SV_PROFILE_SAVED}'},'preferences-sv'],[{textRegex:'${MAESTRO_PROFILE_SAVED}'},'preferences-en'],
].map(([selector,target])=>[JSON.stringify(Object.entries(selector).sort(([a],[b])=>a.localeCompare(b))),target]));
function assertionTarget(command){
 const condition=command.assertConditionCommand.condition;
 if(!plain(condition)||Object.keys(condition).some(key=>key!=='visible'&&condition[key]!==null)||!plain(condition.visible))return 'UNKNOWN';
 const selector=Object.entries(condition.visible).filter(([key,value])=>value!==null&&!(key==='optional'&&value===false)).sort(([a],[b])=>a.localeCompare(b));
 return ASSERT_TARGETS.get(JSON.stringify(selector))??'UNKNOWN';
}
function validateMetadata(metadata){
 if(!plain(metadata)||Object.keys(metadata).some(key=>!['status','sequenceNumber','depth','timestamp','duration','error','evaluatedCommand','artifacts'].includes(key))||!STATUSES.includes(metadata.status)||!integer(metadata.sequenceNumber)||!integer(metadata.depth)||metadata.depth>32)throw Error('invalid');
 for(const field of ['timestamp','duration'])if(Object.hasOwn(metadata,field)&&!integer(metadata[field]))throw Error('invalid');
 if(Object.hasOwn(metadata,'evaluatedCommand')&&!plain(metadata.evaluatedCommand))throw Error('invalid');
 if(Object.hasOwn(metadata,'error')){if(!plain(metadata.error)||Object.keys(metadata.error).some(key=>!['message','debugMessage'].includes(key))||Object.values(metadata.error).some(value=>typeof value!=='string'))throw Error('invalid');}
 if(Object.hasOwn(metadata,'artifacts')){if(!Array.isArray(metadata.artifacts)||metadata.artifacts.some(artifact=>!plain(artifact)||Object.keys(artifact).sort().join(',')!=='path,type'||typeof artifact.path!=='string'||typeof artifact.type!=='string'))throw Error('invalid');}
}
// Pinned Orchestra emits original executedSteps in sequence; gaps/hooks/continued failures are not a source prefix.
function headerOccurrence(rows){
 if(rows.some((row,index)=>row.metadata.sequenceNumber!==index||row.metadata.depth!==0||row.metadata.status!==(index===rows.length-1?'FAILED':'COMPLETED')))return 'UNKNOWN';
 const config=rows[1]?.command.applyConfigurationCommand?.config;
 if(!plain(config)||config.appId!=='se.subtrack.app'||config.onFlowStart!=null||config.onFlowComplete!=null)return 'UNKNOWN';
 let headers=0;
 for(let index=1;index<rows.length-1;index++){
  const kind=commandKind(rows[index].command);if(kind==='SUBFLOW')return 'UNKNOWN';if(kind==='CONFIGURATION'&&index!==1)return 'UNKNOWN';
  if(kind==='SCROLL_UNTIL_VISIBLE'){const target=scrollTarget(rows[index].command);if(target==='UNKNOWN')return 'UNKNOWN';if(target==='personal-title')headers++;}
 }
 return headers===0?'ENTRY_HEADER':headers===1?'SAVED_HEADER':'UNKNOWN';
}
/** Strict producer-shaped projection; payloads and error prose never classify a command. */
export function projectEnrollmentMetadata(bytes){
 try{const rows=strictJson(bytes);if(!Array.isArray(rows)||rows.length===0||rows.length>128)throw Error('invalid');let last=-1;const failed=[];
  for(const [index,row] of rows.entries()){if(!plain(row)||Object.keys(row).sort().join(',')!=='command,metadata')throw Error('invalid');validateMetadata(row.metadata);if(row.metadata.sequenceNumber<=last)throw Error('invalid');last=row.metadata.sequenceNumber;
   if(index===0){if(!plain(row.command)||Object.keys(row.command).join(',')!=='defineVariablesCommand'||!plain(row.command.defineVariablesCommand)||row.metadata.status!=='COMPLETED'||row.metadata.depth!==0)throw Error('invalid');continue;}
   const kind=commandKind(row.command);if(row.metadata.status==='FAILED'){if(row.metadata.depth!==0)throw Error('invalid');failed.push({kind,target:kind==='SCROLL_UNTIL_VISIBLE'?scrollTarget(row.command):kind==='ASSERT_CONDITION'?assertionTarget(row.command):'UNKNOWN'});}}
  return failed.length===1?closed('AVAILABLE',failed[0].kind,failed[0].target,failed[0].kind==='SCROLL_UNTIL_VISIBLE'&&failed[0].target==='personal-title'?headerOccurrence(rows):'UNKNOWN'):closed('UNAVAILABLE');
 }catch{return closed('INVALID');}
}
function directory(path){const stat=lstatSync(path,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||realpathSync(path)!==resolve(path))throw Error('unavailable');return stat;}
const same=(left,right)=>left.dev===right.dev&&left.ino===right.ino;
export const PREINPUT_METADATA_CHECKS=Object.freeze([
 ...['CAPTURE_PARENT','CAPTURE_ROOT','READ_PARENT','READ_ROOT','TIMESTAMP','FLOW','FINAL_ROOT','FINAL_PARENT','FINAL_TIMESTAMP','FINAL_FLOW'].flatMap(prefix=>['STAT','TYPE','CANONICAL'].map(check=>`${prefix}_${check}`)),
 'CREATE_ROOT',...['READ_PARENT','READ_ROOT','FINAL_ROOT','FINAL_PARENT','FINAL_TIMESTAMP','FINAL_FLOW'].map(prefix=>`${prefix}_IDENTITY`),
 ...['TIMESTAMP','FLOW','BUNDLE'].flatMap(prefix=>['LIST','LIMIT'].map(check=>`${prefix}_${check}`)),
 'TIMESTAMP_COUNT','TIMESTAMP_ENTRY_TYPE','TIMESTAMP_NAME','FLOW_COUNT','FLOW_NAME','FLOW_ENTRY_TYPE','BUNDLE_SYMLINK',
 ...['STAT','TYPE','EMPTY','CANONICAL','OPEN','OPEN_STAT','OPEN_TYPE','OPEN_IDENTITY','OPEN_SIZE','READ','AFTER_STAT','AFTER_TYPE','AFTER_IDENTITY','AFTER_SIZE'].map(check=>`COMMAND_${check}`),'CLOSE',
 'RUNNER_NAME','RUNNER_ENTRY_TYPE','RUNNER_STAT','RUNNER_TYPE','RUNNER_CANONICAL','FINAL_PORTFOLIO_LIST','FINAL_PORTFOLIO_LIMIT','FINAL_PORTFOLIO_SET','FINAL_RUNNER_STAT','FINAL_RUNNER_TYPE','FINAL_RUNNER_CANONICAL','FINAL_RUNNER_IDENTITY',
]);
/** Fresh enrollment output ownership is captured before its unchanged child invocation. */
function prepareCommandMetadata(privateRoot,execution,flowName,phaseName,project,platform='android'){
 let ownership=null,failed='UNKNOWN';
 const fail=name=>{if(failed==='UNKNOWN')failed=name;};
 const attempt=(name,operation)=>{try{return operation();}catch(error){fail(name);throw error;}};
 const require=(name,condition)=>{if(!condition){fail(name);throw Error('unavailable');}};
 function ownedDirectory(path,prefix){const stat=attempt(`${prefix}_STAT`,()=>lstatSync(path,{bigint:true}));require(`${prefix}_TYPE`,!stat.isSymbolicLink()&&stat.isDirectory());require(`${prefix}_CANONICAL`,attempt(`${prefix}_CANONICAL`,()=>realpathSync(path))===resolve(path));return stat;}
 function ownedRunner(path,prefix){const stat=attempt(`${prefix}_STAT`,()=>lstatSync(path,{bigint:true}));require(`${prefix}_TYPE`,!stat.isSymbolicLink()&&stat.isFile());require(`${prefix}_CANONICAL`,attempt(`${prefix}_CANONICAL`,()=>realpathSync(path))===resolve(path));return stat;}
 function ownedInventory(path,prefix){const entries=attempt(`${prefix}_LIST`,()=>readdirSync(path,{withFileTypes:true}));require(`${prefix}_LIMIT`,entries.length<=32);return entries;}
 try{const parent=resolve(privateRoot),parentStat=ownedDirectory(parent,'CAPTURE_PARENT'),root=join(parent,flowName);attempt('CREATE_ROOT',()=>mkdirSync(root,{mode:0o700}));ownership={parent,parentStat,root,rootStat:ownedDirectory(root,'CAPTURE_ROOT')};}catch{/* No file errors or paths escape. */}
 return Object.freeze({metadataCheck:()=>failed,read(phase){
  let snapshot;try{snapshot=execution.snapshot();}catch{return null;}
  if(phase!==phaseName||!snapshot||!['launch-error','exit-nonzero','signal'].includes(snapshot.outcome))return null;
  if(!ownership)return closed('UNAVAILABLE');
  let descriptor=null;
  try{const {parent,parentStat,root,rootStat}=ownership;require('READ_PARENT_IDENTITY',same(ownedDirectory(parent,'READ_PARENT'),parentStat));require('READ_ROOT_IDENTITY',same(ownedDirectory(root,'READ_ROOT'),rootStat));
   const times=ownedInventory(root,'TIMESTAMP');require('TIMESTAMP_COUNT',times.length===1);require('TIMESTAMP_ENTRY_TYPE',!times[0].isSymbolicLink()&&times[0].isDirectory());require('TIMESTAMP_NAME',/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(times[0].name));
   const timestamp=join(root,times[0].name),timestampStat=ownedDirectory(timestamp,'TIMESTAMP');const flows=ownedInventory(timestamp,'FLOW'),expected=`private-runtime-${flowName}`,ios=platform==='ios',selected=ios&&flows.length>1?flows.filter(entry=>entry.name===expected):flows;require('FLOW_COUNT',selected.length===1);require('FLOW_NAME',selected[0].name===expected);require('FLOW_ENTRY_TYPE',!selected[0].isSymbolicLink()&&selected[0].isDirectory());
   // Pinned cli2.11 iOS session writes these siblings beside the exact per-flow bundle. Never read their contents.
   const runners=[];if(ios)for(const entry of flows){if(entry===selected[0])continue;require('RUNNER_NAME',/^xctest_runner_\d{4}-\d{2}-\d{2}_\d{6}\.log$/.test(entry.name));require('RUNNER_ENTRY_TYPE',!entry.isSymbolicLink()&&entry.isFile());const path=join(timestamp,entry.name);runners.push({path,stat:ownedRunner(path,'RUNNER')});}
   const flow=join(timestamp,`private-runtime-${flowName}`),flowStat=ownedDirectory(flow,'FLOW');const entries=ownedInventory(flow,'BUNDLE');require('BUNDLE_SYMLINK',!entries.some(entry=>entry.isSymbolicLink()));
   const file=join(flow,'commands.json'),before=attempt('COMMAND_STAT',()=>lstatSync(file,{bigint:true}));require('COMMAND_TYPE',!before.isSymbolicLink()&&before.isFile());if(before.size>BigInt(MAX_BYTES))return closed('INVALID');require('COMMAND_EMPTY',before.size!==0n);
   require('COMMAND_CANONICAL',attempt('COMMAND_CANONICAL',()=>realpathSync(file))===resolve(file));descriptor=attempt('COMMAND_OPEN',()=>openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW));const opened=attempt('COMMAND_OPEN_STAT',()=>fstatSync(descriptor,{bigint:true}));require('COMMAND_OPEN_TYPE',opened.isFile());require('COMMAND_OPEN_IDENTITY',same(opened,before));require('COMMAND_OPEN_SIZE',opened.size===before.size);
   const bytes=attempt('COMMAND_READ',()=>readFileSync(descriptor)),after=attempt('COMMAND_AFTER_STAT',()=>lstatSync(file,{bigint:true}));require('COMMAND_AFTER_TYPE',!after.isSymbolicLink());require('COMMAND_AFTER_IDENTITY',same(after,opened));require('COMMAND_AFTER_SIZE',after.size===opened.size);
   require('FINAL_ROOT_IDENTITY',same(ownedDirectory(root,'FINAL_ROOT'),rootStat));require('FINAL_PARENT_IDENTITY',same(ownedDirectory(parent,'FINAL_PARENT'),parentStat));require('FINAL_TIMESTAMP_IDENTITY',same(ownedDirectory(timestamp,'FINAL_TIMESTAMP'),timestampStat));require('FINAL_FLOW_IDENTITY',same(ownedDirectory(flow,'FINAL_FLOW'),flowStat));
   if(ios){const finalEntries=ownedInventory(timestamp,'FINAL_PORTFOLIO'),beforeNames=flows.map(entry=>entry.name).sort(),afterNames=finalEntries.map(entry=>entry.name).sort();require('FINAL_PORTFOLIO_SET',beforeNames.length===afterNames.length&&beforeNames.every((name,index)=>name===afterNames[index])&&finalEntries.some(entry=>entry.name===expected&&!entry.isSymbolicLink()&&entry.isDirectory()));for(const runner of runners)require('FINAL_RUNNER_IDENTITY',same(ownedRunner(runner.path,'FINAL_RUNNER'),runner.stat));}
   return project(bytes,{flow,flowStat,file,stat:after,timestamp,parent,root});
  }catch{return closed('UNAVAILABLE');}finally{if(descriptor!==null)attempt('CLOSE',()=>closeSync(descriptor));}
 }});
}
export function prepareEnrollmentMetadata(privateRoot,execution,platform='android'){if(!['android','ios'].includes(platform))throw Error('Invalid metadata platform');return prepareCommandMetadata(privateRoot,execution,'enroll-add','flow-enroll-add',projectEnrollmentMetadata,platform);}
/** Separate Home reader; the original entry reader/projector and capture authority remain unchanged. */
export function prepareHomeEnrollmentMetadata(privateRoot,execution,admitPrefix){
 return prepareCommandMetadata(privateRoot,execution,'enroll-add','flow-enroll-add',bytes=>{
  const result=projectEnrollmentMetadata(bytes);
  if(result.metadata!=='AVAILABLE'||result.command!=='ASSERT_CONDITION'||!['home-en','home-sv'].includes(result.target)||result.occurrence!=='UNKNOWN'||!admitPrefix(bytes,result.target))return closed('UNAVAILABLE');
  return result;
 },'android');
}
/** Separate edit pre-Save reader. Original enrollment/Home projectors and authorities remain unchanged. */
export function prepareEditStatusMetadata(privateRoot,execution,admitPrefix){
 return prepareCommandMetadata(privateRoot,execution,'edit-status','flow-edit-status',bytes=>{
  try{const rows=strictJson(bytes);if(!Array.isArray(rows)||rows.length<3||rows.length>128)throw Error('invalid');
   for(const row of rows){if(!plain(row)||Object.keys(row).sort().join(',')!=='command,metadata')throw Error('invalid');validateMetadata(row.metadata);}
   if(!admitPrefix(Buffer.from(JSON.stringify(rows))))return closed('UNAVAILABLE');
   return closed('AVAILABLE','SCROLL_UNTIL_VISIBLE','UNKNOWN');
  }catch{return closed('INVALID');}
 },'android');
}
/** Only this exact fixed grammar may leave the private invocation. */
export function enrollmentMetadataLines(result){
 if(!plain(result)||Object.keys(result).sort().join(',')!=='command,errorClass,metadata,occurrence,target'||!['AVAILABLE','UNAVAILABLE','INVALID'].includes(result.metadata)||!['UNKNOWN',...Object.values(KINDS)].includes(result.command)||!TARGETS.includes(result.target)||!ENROLLMENT_HEADER_OCCURRENCES.includes(result.occurrence)||(result.occurrence!=='UNKNOWN'&&(result.metadata!=='AVAILABLE'||result.command!=='SCROLL_UNTIL_VISIBLE'||result.target!=='personal-title'))||(!['SCROLL_UNTIL_VISIBLE','ASSERT_CONDITION'].includes(result.command)&&result.target!=='UNKNOWN')||result.errorClass!=='UNKNOWN'||(result.metadata!=='AVAILABLE'&&result.command!=='UNKNOWN')||(result.metadata==='AVAILABLE'&&result.command==='UNKNOWN'))return null;
 return Object.freeze([`enrollment-structured-metadata=${result.metadata}`,`enrollment-failed-command=${result.command}`,`enrollment-failed-target=${result.target}`,`enrollment-failed-occurrence=${result.occurrence}`,'enrollment-error-class=UNKNOWN']);
}

export const PREINPUT_RECIPIENT_SHA256='78dcbab092c04038de65ae94c8ede017230bcdd2e920893b11a246a30e122c5f';
const PREINPUT_LIMIT=8*1024*1024,PREINPUT_MAGIC=Buffer.from('ST253IMG1\n'),OAEP_LABEL=Buffer.from('ST253_PREINPUT_IOS_FRAME_V1\0');
const rejectCapture=()=>{throw Error('Private diagnostic unavailable');};
const ownData=(value,keys)=>{if(!plain(value))return false;const d=Object.getOwnPropertyDescriptors(value);return Reflect.ownKeys(d).length===keys.length&&keys.every(key=>d[key]&&'value'in d[key]&&d[key].enumerable);};
const emptyDefaults=(value,allowed,required={})=>plain(value)&&Object.keys(value).every(key=>allowed.includes(key)&&(Object.hasOwn(required,key)||value[key]===null||key==='optional'&&value[key]===false))&&Object.entries(required).every(([key,want])=>value[key]===want);
/** Exactly the original first Welcome failure; no completed input/tap can fit this record portfolio. */
export function preinputWelcomeMetadata(bytes){
 try{const rows=strictJson(bytes);if(!Array.isArray(rows)||rows.length!==4)return false;
  const names=['defineVariablesCommand','applyConfigurationCommand','launchAppCommand','assertConditionCommand'];
  for(const [i,row]of rows.entries()){if(!plain(row)||Object.keys(row).sort().join(',')!=='command,metadata')return false;validateMetadata(row.metadata);if(row.metadata.sequenceNumber!==i||row.metadata.depth!==0||row.metadata.status!==(i===3?'FAILED':'COMPLETED')||!plain(row.command)||Object.keys(row.command).join(',')!==names[i]||!plain(row.command[names[i]]))return false;}
  const config=rows[1].command.applyConfigurationCommand.config;if(!plain(config)||config.appId!=='se.subtrack.app'||config.onFlowStart!=null||config.onFlowComplete!=null)return false;
  const launch=rows[2].command.launchAppCommand;if(!emptyDefaults(launch,['appId','clearState','clearKeychain','stopApp','permissions','launchArguments','label','optional'],{appId:'se.subtrack.app',clearState:true}))return false;
  const assertion=rows[3].command.assertConditionCommand;if(!emptyDefaults(assertion,['condition','timeout','label','optional'],{condition:assertion.condition,timeout:'120000'}))return false;
  const condition=assertion.condition;if(!emptyDefaults(condition,['visible','notVisible','platform','scriptCondition','label'],{visible:condition?.visible}))return false;
  return emptyDefaults(condition.visible,['textRegex','idRegex','size','below','above','leftOf','rightOf','containsChild','containsDescendants','traits','index','enabled','optional','selected','checked','focused','childOf','css'],{textRegex:'${MAESTRO_CREATE_ACCOUNT}'});
 }catch{return false;}
}
export function preparePreinputMetadata(privateRoot){
 let exit=false,closedExit=false,invalid=false,taken=false,failure='CHILD_LIFECYCLE',proof=null,sourceStat=null,sourceHash=null,copied=false,removed=false;const invocation=randomUUID();
 const execution={snapshot:()=>({outcome:exit&&closedExit&&!invalid?'exit-nonzero':'unavailable'})};
 const reader=prepareCommandMetadata(privateRoot,execution,'identifier','flow-identifier',(bytes,owned)=>{const eligible=preinputWelcomeMetadata(bytes);if(eligible){const next={...owned,hash:digest(bytes),artifact:preinputOriginalScreenshotMetadata(bytes)};if(proof){if(proof.hash!==next.hash||proof.flow!==next.flow||!originalFrameIdentity(proof.stat,next.stat)||!same(proof.flowStat,next.flowStat))return Object.freeze({eligible:false});}else proof=next;}return Object.freeze({eligible});},'ios');
 const check=()=>{if(!taken||invalid||!exit||!closedExit||!proof?.artifact||reader.read('flow-identifier')?.eligible!==true||!originalFrameIdentity(proof.stat,originalFrameState(proof.file)))rejectCapture();for(const dir of [proof.parent,proof.root,proof.timestamp,proof.flow,join(proof.flow,'screenshots')]){const s=privateDirectory(dir);if((s.mode&0o777n)!==0o700n)rejectCapture();}return join(proof.flow,PREINPUT_ORIGINAL_SCREENSHOT);};
 const absent=()=>{const file=check();try{lstatSync(file);rejectCapture();}catch(error){if(error?.code!=='ENOENT')throw error;}if(readdirSync(dirname(file)).length!==0)rejectCapture();return true;};
 const remove=()=>{if(!sourceStat)return;if(removed){absent();return;}const file=check(),current=originalFrameState(file);if(!originalFrameIdentity(current,sourceStat))rejectCapture();const bytes=originalFrameBytes(file,sourceStat);try{if(digest(bytes)!==sourceHash)rejectCapture();}finally{bytes.fill(0);}unlinkSync(file);removed=true;absent();};
 return Object.freeze({record(event,code,signal){if(event==='error'){invalid=true;return;}if((event!=='exit'&&event!=='close')||code!==1||signal!==null){invalid=true;return;}if(event==='exit'){if(exit||closedExit)invalid=true;exit=true;}else{if(!exit||closedExit)invalid=true;closedExit=true;}},take(){if(taken)return null;taken=true;let result;try{result=reader.read('flow-identifier');}catch{failure='METADATA_OWNERSHIP';return null;}if(!exit||!closedExit||invalid)return null;failure=result.eligible===false||result.metadata==='INVALID'?'METADATA_SHAPE':'METADATA_OWNERSHIP';return result.eligible===true?Object.freeze({invocation}):null;},copyOriginalFrame(destination){if(copied||destination!==join(privateRoot,'preinput-ios-frame','frame.png'))rejectCapture();const file=check();if(readdirSync(dirname(file)).length!==1||readdirSync(dirname(file))[0]!==basename(file))rejectCapture();sourceStat=originalFrameState(file);const bytes=originalFrameBytes(file,sourceStat);try{sourceHash=digest(bytes);if(!validPreinputPng(bytes))rejectCapture();writeFileSync(destination,bytes,{flag:'wx',mode:0o600});if(!originalFrameIdentity(originalFrameState(file),sourceStat))rejectCapture();check();copied=true;}finally{bytes.fill(0);}},removeOriginalFrame:remove,verifyOriginalFrameBytes(bytes){if(!copied||removed||invalid||!Buffer.isBuffer(bytes)||digest(bytes)!==sourceHash)rejectCapture();return true;},verifyOriginalFrameAbsent(){if(!copied||!removed)rejectCapture();return absent();},failureStage:()=>failure,ownershipCheck:()=>reader.metadataCheck()});
}
// cli-2.11.0 ArtifactsGenerator118–138 captures the failed original command,
// StepArtifactNaming35–52 uses its 1-based sequence and a 40-character raw slug.
// https://github.com/mobile-dev-inc/Maestro/blob/cli-2.11.0/maestro-orchestra/src/main/kotlin/maestro/orchestra/debug/StepArtifactNaming.kt
export const PREINPUT_ORIGINAL_SCREENSHOT='screenshots/step-004-assertCondition-${MAESTRO_CREATE_ACCOUNT.png';
const originalHierarchy=PREINPUT_ORIGINAL_SCREENSHOT.replace('screenshots/','screen-hierarchy/').replace(/\.png$/,'.json');
export function preinputOriginalScreenshotMetadata(bytes){try{if(!preinputWelcomeMetadata(bytes))return false;const rows=strictJson(bytes);if(rows.slice(0,3).some(row=>(row.metadata.artifacts??[]).length!==0))return false;const artifacts=rows[3].metadata.artifacts;if(!Array.isArray(artifacts)||artifacts.length<1||artifacts.length>2)return false;return artifacts.filter(item=>item.type==='SCREENSHOT'&&item.path===PREINPUT_ORIGINAL_SCREENSHOT).length===1&&artifacts.every(item=>item.type==='SCREENSHOT'&&item.path===PREINPUT_ORIGINAL_SCREENSHOT||item.type==='SCREEN_HIERARCHY'&&item.path===originalHierarchy);}catch{return false;}}
function originalFrameIdentity(a,b){return ['dev','ino','mode','uid','gid','nlink','size','mtimeNs','ctimeNs'].every(key=>a[key]===b[key]);}
function originalFrameState(file){const s=lstatSync(file,{bigint:true});if(s.isSymbolicLink()||!s.isFile()||s.nlink!==1n||(s.mode&0o777n)!==0o600n||typeof process.getuid==='function'&&s.uid!==BigInt(process.getuid())||s.size<1n||s.size>8388608n||realpathSync(file)!==resolve(file))rejectCapture();return s;}
function originalFrameBytes(file,before){const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW),buffer=Buffer.alloc(Number(before.size)+1);try{if(!originalFrameIdentity(before,fstatSync(fd,{bigint:true})))rejectCapture();let length=0;while(length<buffer.length){const count=readSync(fd,buffer,length,buffer.length-length,null);if(count===0)break;length+=count;}if(BigInt(length)!==before.size||!originalFrameIdentity(before,fstatSync(fd,{bigint:true}))||!originalFrameIdentity(before,originalFrameState(file)))rejectCapture();return Buffer.from(buffer.subarray(0,length));}finally{buffer.fill(0);closeSync(fd);}}
export function preinputCaptureContext(environment,head){
 try{const e=environment;
  const authority=e.GITHUB_EVENT_NAME==='pull_request'&&e.GITHUB_REF==='refs/pull/293/merge'&&e.GITHUB_HEAD_REF==='codex/native-owner-search'
   ||e.GITHUB_EVENT_NAME==='pull_request'&&e.GITHUB_REF==='refs/pull/292/merge'&&e.GITHUB_HEAD_REF==='st/native-synthetic-bank'&&e.ST253_CAPTURE_BASE_REF==='st/native-billing-month'&&e.SUBTRACK_NATIVE_PROOF_SCOPE==='full'
   ||e.GITHUB_EVENT_NAME==='pull_request'&&/^refs\/pull\/[1-9][0-9]{0,19}\/merge$/.test(e.GITHUB_REF)&&e.GITHUB_HEAD_REF==='codex/sweden-data-native-followup'&&e.ST253_CAPTURE_BASE_REF==='st/native-synthetic-bank'&&e.SUBTRACK_NATIVE_PROOF_SCOPE==='full'
   ||e.GITHUB_EVENT_NAME==='workflow_dispatch'&&e.GITHUB_REF==='refs/heads/codex/ios-startup-fixes'&&!e.GITHUB_HEAD_REF&&e.ST253_CAPTURE_DISPATCH_SOURCE===head&&e.GITHUB_SHA===head;
  if(!authority||e.ST253_CAPTURE_ENABLED!=='true'||e.ST253_CAPTURE_PLATFORM!=='ios'||e.ST253_CAPTURE_HEAD_REPOSITORY!=='achkum/Applied-AI-Projects'||e.NODE_ENV!=='development'||e.SUBTRACK_PRIVATE_DEVICE_PROOF!=='true'||e.EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC!=='true'||e.EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED!=='true'||e.EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL!=='https://localhost:3443'||e.GITHUB_REPOSITORY!=='achkum/Applied-AI-Projects'||e.ST253_CAPTURE_SOURCE_HEAD!==head||!/^[a-f0-9]{40}$/.test(head)||! /^[1-9][0-9]{0,19}$/.test(e.GITHUB_RUN_ID)||! /^[1-9][0-9]{0,3}$/.test(e.GITHUB_RUN_ATTEMPT)||! /^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/.test(e.SUBTRACK_SIMULATOR_UDID))return null;
  return Object.freeze({sourceHead:head,runId:e.GITHUB_RUN_ID,attempt:e.GITHUB_RUN_ATTEMPT,udid:e.SUBTRACK_SIMULATOR_UDID});
 }catch{return null;}
}
const digest=value=>createHash('sha256').update(value).digest('hex');
function privateDirectory(path){const stat=directory(path);if((stat.mode&0o077n)!==0n||typeof process.getuid==='function'&&stat.uid!==BigInt(process.getuid()))rejectCapture();return stat;}
function privateBytes(path,limit){const before=lstatSync(path,{bigint:true});if(before.isSymbolicLink()||!before.isFile()||(before.mode&0o077n)!==0n||before.size<1n||before.size>BigInt(limit)||typeof process.getuid==='function'&&before.uid!==BigInt(process.getuid())||realpathSync(path)!==resolve(path))rejectCapture();const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const opened=fstatSync(fd,{bigint:true});if(!same(before,opened)||opened.size!==before.size)rejectCapture();const bytes=readFileSync(fd),after=lstatSync(path,{bigint:true});if(!same(opened,after)||after.size!==opened.size||after.isSymbolicLink())rejectCapture();return bytes;}finally{closeSync(fd);}}
function captureRoot(privateRoot){if(basename(privateRoot)!=='private'||basename(dirname(privateRoot))!=='subtrack-native-proof')rejectCapture();privateDirectory(privateRoot);return dirname(privateRoot);}
export function recordPreinputSimulator(privateRoot,context){
 captureRoot(privateRoot);if(!ownData(context,['sourceHead','runId','attempt','udid']))rejectCapture();
 const bytes=Buffer.from(JSON.stringify({version:1,...context,device:'iPhone-17',runtime:'iOS-26-2',fresh:true}));writeFileSync(join(privateRoot,'preinput-ios-custody.json'),bytes,{flag:'wx',mode:0o600});
}
function readCustody(privateRoot,context){const bytes=privateBytes(join(privateRoot,'preinput-ios-custody.json'),4096),value=strictJson(bytes);if(!ownData(value,['version','sourceHead','runId','attempt','udid','device','runtime','fresh'])||value.version!==1||value.device!=='iPhone-17'||value.runtime!=='iOS-26-2'||value.fresh!==true||Object.keys(context).some(key=>value[key]!==context[key]))rejectCapture();return digest(bytes);}
export function zeroAllApi(value){try{return ownData(value,['state','arrivals'])&&value.state==='active'&&value.arrivals==='zero';}catch{return false;}}
function boundedInflate(bytes,max){const result=inflateSync(bytes,{maxOutputLength:max,info:true});if(result.engine.bytesWritten!==bytes.length)rejectCapture();return result.buffer;}
/** Conservative PNG envelope: bounded chunks, CRC, truecolor scanline/decompression budget, no text/EXIF. */
export function validPreinputPng(bytes){
 try{if(!Buffer.isBuffer(bytes)||bytes.length<57||bytes.length>PREINPUT_LIMIT||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return false;
  let at=8,width=0,height=0,bpp=0,ended=false,seenData=false,dataEnded=false,seenDot=false,ancillary=0,count=0;const compressed=[];
  while(at<bytes.length){if(++count>128||at+12>bytes.length)return false;const length=bytes.readUInt32BE(at),end=at+12+length;if(end>bytes.length)return false;const kind=bytes.toString('ascii',at+4,at+8),body=bytes.subarray(at+8,at+8+length);if(crc32(bytes.subarray(at+4,at+8+length))!==bytes.readUInt32BE(at+8+length))return false;
   if(kind==='IHDR'){if(at!==8||length!==13)return false;width=body.readUInt32BE(0);height=body.readUInt32BE(4);if(width<1||height<1||width>4096||height>4096||width*height>16777216||body[8]!==8||![2,6].includes(body[9])||body[10]!==0||body[11]!==0||body[12]!==0)return false;bpp=body[9]===2?3:4;}
   else if(kind==='IDAT'){if(!bpp||dataEnded)return false;seenData=true;compressed.push(body);}
   else if(kind==='IEND'){if(length!==0||end!==bytes.length||!seenData)return false;ended=true;}
   else{if(!bpp||!['gAMA','sRGB','cHRM','pHYs','iCCP','iDOT'].includes(kind)||length>65536||(ancillary+=length)>262144)return false;if(seenData)dataEnded=true;
    // Documented Apple ancillary optimization; decode the complete IDAT stream
    // normally, never follow its segment offsets. pngcheck v4.0.1 framing:
    // https://github.com/pnggroup/pngcheck/blob/v4.0.1/pngcheck.c#L2164-L2191
    // https://w3c.github.io/png/extensions/Overview.html#iDOT
    if(kind==='iDOT'){if(!bytes.subarray(at+4,at+8).equals(Buffer.from('iDOT'))||seenDot||seenData||length<16||body.readUInt32BE(0)<1||length!==4+12*body.readUInt32BE(0))return false;seenDot=true;}
    else if(kind==='iCCP'){const separator=body.indexOf(0);if(separator<1||separator>79||body[separator+1]!==0)return false;boundedInflate(body.subarray(separator+2),65536);}
    else if(length!==({gAMA:4,sRGB:1,cHRM:32,pHYs:9})[kind])return false;
   }at=end;
  }
  if(!ended)return false;const row=width*bpp+1,raw=boundedInflate(Buffer.concat(compressed),row*height);if(raw.length!==row*height)return false;for(let offset=0;offset<raw.length;offset+=row)if(raw[offset]>4)return false;return true;
 }catch{return false;}
}
function canonicalAad(binding){if(!ownData(binding,['version','sourceHead','runId','attempt','invocation','simulatorCustody','recipient'])||binding.version!==1||!/^[a-f0-9]{40}$/.test(binding.sourceHead)||! /^[1-9][0-9]{0,19}$/.test(binding.runId)||! /^[1-9][0-9]{0,3}$/.test(binding.attempt)||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(binding.invocation)||! /^[a-f0-9]{64}$/.test(binding.simulatorCustody)||binding.recipient!==PREINPUT_RECIPIENT_SHA256)rejectCapture();return Buffer.from(JSON.stringify({version:1,sourceHead:binding.sourceHead,runId:binding.runId,attempt:binding.attempt,invocation:binding.invocation,simulatorCustody:binding.simulatorCustody,recipient:binding.recipient}));}
export function sealPreinputPng(png,binding,recipientPem){
 if(!validPreinputPng(png))rejectCapture();const recipient=createPublicKey(recipientPem);if(recipient.asymmetricKeyType!=='rsa'||recipient.asymmetricKeyDetails.modulusLength!==3072||digest(recipient.export({type:'spki',format:'der'}))!==PREINPUT_RECIPIENT_SHA256)rejectCapture();
 const aad=canonicalAad(binding),key=randomBytes(32);try{const iv=randomBytes(12),wrapped=publicEncrypt({key:recipient,padding:cryptoConstants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256',oaepLabel:OAEP_LABEL},key),cipher=createCipheriv('aes-256-gcm',key,iv,{authTagLength:16});cipher.setAAD(aad);const ciphertext=Buffer.concat([cipher.update(png),cipher.final()]),length=Buffer.alloc(4);length.writeUInt32BE(aad.length);return Buffer.concat([PREINPUT_MAGIC,length,aad,iv,wrapped,cipher.getAuthTag(),ciphertext]);}finally{key.fill(0);}
}
export function validSealedPreinput(bytes,context,custody){try{if(!Buffer.isBuffer(bytes)||bytes.length<500||bytes.length>PREINPUT_LIMIT+4096||!bytes.subarray(0,PREINPUT_MAGIC.length).equals(PREINPUT_MAGIC))return false;const n=bytes.readUInt32BE(PREINPUT_MAGIC.length);if(n<1||n>2048||bytes.length<PREINPUT_MAGIC.length+4+n+12+384+16+57)return false;const aad=bytes.subarray(PREINPUT_MAGIC.length+4,PREINPUT_MAGIC.length+4+n),value=strictJson(aad);return canonicalAad(value).equals(aad)&&value.sourceHead===context.sourceHead&&value.runId===context.runId&&value.attempt===context.attempt&&value.simulatorCustody===custody;}catch{return false;}}
export function validatedPreinputArtifact(privateRoot,context){try{if(existsSync(join(privateRoot,'preinput-ios-frame')))return false;const root=captureRoot(privateRoot),custody=readCustody(privateRoot,context);privateDirectory(join(root,'sealed'));return validSealedPreinput(privateBytes(join(root,'sealed','preinput-ios.st253sealed'),PREINPUT_LIMIT+4096),context,custody);}catch{return false;}}
export const PREINPUT_WITHHELD_STAGES=Object.freeze(['CHILD_LIFECYCLE','METADATA_OWNERSHIP','METADATA_SHAPE','CUSTODY','API_BEFORE','APP_CUSTODY','CAPTURE','PNG','API_AFTER','SEAL','RAW_CLEANUP','SEALED_OUTPUT','SEALED_READBACK']);
export async function captureSealedOriginalPreinput(options){const {reader,capture}=options;return captureSealedPreinput({...options,capture:async(file,udid)=>{await capture(file,udid);reader.copyOriginalFrame(file);},sourceMatches:bytes=>reader.verifyOriginalFrameBytes(bytes),sourceCleanup:()=>reader.removeOriginalFrame(),sourceAbsent:()=>reader.verifyOriginalFrameAbsent()});}
export async function captureSealedPreinput({privateRoot,reader,context,observe,capture,recipientPem,onStage,sourceMatches,sourceCleanup,sourceAbsent}){
 const stage=value=>{try{onStage?.(value);}catch{/* A diagnostic consumer cannot change qualification or eligibility. */}};
 let png,sealed,raw,frame,sealedFile,clean=false,published=false;
 try{stage('CUSTODY');const root=captureRoot(privateRoot);if(!context||(process.umask()&0o077)!==0o077)return false;stage('CHILD_LIFECYCLE');const ticket=reader.take();if(!ticket){const failure=reader.failureStage?.();stage(['METADATA_OWNERSHIP','METADATA_SHAPE'].includes(failure)?failure:'CHILD_LIFECYCLE');return false;}stage('CUSTODY');const custody=readCustody(privateRoot,context);stage('API_BEFORE');if(!zeroAllApi(observe()))return false;
  stage('CUSTODY');frame=join(privateRoot,'preinput-ios-frame');mkdirSync(frame,{mode:0o700});privateDirectory(frame);raw=join(frame,'frame.png');stage('APP_CUSTODY');await capture(raw,context.udid);stage('PNG');png=privateBytes(raw,PREINPUT_LIMIT);if(!validPreinputPng(png)||sourceMatches&&sourceMatches(png)!==true)return false;await setImmediate();stage('API_AFTER');if(!zeroAllApi(observe()))return false;
  stage('SEAL');sealed=sealPreinputPng(png,{version:1,sourceHead:context.sourceHead,runId:context.runId,attempt:context.attempt,invocation:ticket.invocation,simulatorCustody:custody,recipient:PREINPUT_RECIPIENT_SHA256},recipientPem);
  if(!validSealedPreinput(sealed,context,custody))return false;
  // Only encrypted bytes survive this scope; output creation happens strictly after raw absence.
  stage('RAW_CLEANUP');if(existsSync(raw))unlinkSync(raw);rmdirSync(frame);sourceCleanup?.();clean=!existsSync(raw)&&!existsSync(frame);if(!clean||sourceAbsent&&sourceAbsent()!==true)return false;privateDirectory(privateRoot);
  stage('SEALED_OUTPUT');const directory=join(root,'sealed');mkdirSync(directory,{mode:0o700});privateDirectory(directory);sealedFile=join(directory,'preinput-ios.st253sealed');writeFileSync(sealedFile,sealed,{mode:0o600,flag:'wx'});stage('SEALED_READBACK');published=validatedPreinputArtifact(privateRoot,context)&&(!sourceAbsent||sourceAbsent()===true);return published;
 }catch{return false;}finally{png?.fill(0);if(!published&&sealedFile)try{if(existsSync(sealedFile))unlinkSync(sealedFile);}catch{stage('RAW_CLEANUP');/* No upload is eligible without final validation. */}if(!clean&&raw)try{if(existsSync(raw))unlinkSync(raw);if(frame&&existsSync(frame))rmdirSync(frame);sourceCleanup?.();}catch{stage('RAW_CLEANUP');/* Cleanup failure cannot publish a sealed artifact. */}}
}


// Android post-input diagnostics are a separate protocol. iOS PREINPUT authority is never reused.
export function validAndroidPng(bytes){
 try{if(!Buffer.isBuffer(bytes)||bytes.length<57||bytes.length>PREINPUT_LIMIT)return false;
  const chunks=[bytes.subarray(0,8)];let at=8,count=0,seenBits=false,seenData=false;
  while(at<bytes.length){if(++count>128||at+12>bytes.length)return false;const length=bytes.readUInt32BE(at),end=at+12+length;if(end>bytes.length)return false;const kind=bytes.toString('ascii',at+4,at+8);
   if(kind==='sBIT'){const body=bytes.subarray(at+8,at+8+length);if(at===8||seenBits||seenData||length!==(bytes[25]===2?3:4)||body.some(value=>value<1||value>8)||crc32(bytes.subarray(at+4,at+8+length))!==bytes.readUInt32BE(at+8+length))return false;seenBits=true;}
   else{chunks.push(bytes.subarray(at,end));if(kind==='IDAT')seenData=true;}at=end;
  }
  return validPreinputPng(Buffer.concat(chunks));
 }catch{return false;}
}

const ANDROID_MAGIC=Buffer.from('ST253AEN1\n'),ANDROID_OAEP=Buffer.from('ST253_ANDROID_ENTRY_HEADER_FRAME_V1\0');
const androidRequire=value=>{if(!value)rejectCapture();};
const hash64=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function androidCaptureContext(environment,head){
 try{const e=environment;if(e.ST253_ANDROID_CAPTURE_ENABLED!=='true'||e.CI!=='true'||e.ST253_CAPTURE_PLATFORM!=='android'||e.ST253_CAPTURE_HEAD_REPOSITORY!=='achkum/Applied-AI-Projects'||e.NODE_ENV!=='development'||e.SUBTRACK_PRIVATE_DEVICE_PROOF!=='true'||e.EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC!=='true'||e.EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED!=='true'||e.EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL!=='https://localhost:3443'||e.GITHUB_REPOSITORY!=='achkum/Applied-AI-Projects'||e.GITHUB_EVENT_NAME!=='pull_request'||e.GITHUB_REF!=='refs/pull/293/merge'||e.GITHUB_HEAD_REF!=='codex/native-owner-search'||e.ST253_CAPTURE_SOURCE_HEAD!==head||!/^[a-f0-9]{40}$/.test(head)||! /^[1-9][0-9]{0,19}$/.test(e.GITHUB_RUN_ID)||! /^[1-9][0-9]{0,3}$/.test(e.GITHUB_RUN_ATTEMPT))return null;
  return Object.freeze({sourceHead:head,runId:e.GITHUB_RUN_ID,attempt:e.GITHUB_RUN_ATTEMPT});
 }catch{return null;}
}
function androidJson(file){return strictJson(privateBytes(file,16384));}
function androidBound(value,context){androidRequire(ownData(context,['sourceHead','runId','attempt']));for(const key of Object.keys(context))androidRequire(value[key]===context[key]);}
const inode=stat=>`${stat.dev}:${stat.ino}`;
const receiptDigest=(file,bytes)=>digest(Buffer.concat([bytes,Buffer.from(inode(lstatSync(file,{bigint:true})))]));
function androidFile(file){const a=lstatSync(file,{bigint:true});androidRequire(a.isFile()&&!a.isSymbolicLink()&&a.size>0n&&a.size<=65536n&&realpathSync(file)===resolve(file));const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const b=fstatSync(fd,{bigint:true}),bytes=readFileSync(fd),c=lstatSync(file,{bigint:true});androidRequire(same(a,b)&&same(b,c)&&a.size===b.size&&b.size===c.size&&!c.isSymbolicLink()&&bytes.length===Number(a.size));return {identity:inode(b),hash:digest(bytes),bytes};}finally{closeSync(fd);}}
function androidPaths(root){captureRoot(root);const avd=join(dirname(root),'avd');privateDirectory(avd);return {avd,data:join(avd,'subtrack-proof.avd'),index:join(avd,'subtrack-proof.ini')};}
function androidCreated(root,context,onStage=()=>{}){onStage('AVD_HOME');const paths=androidPaths(root);onStage('AVD_RECEIPTS');const intentBytes=privateBytes(join(root,'android-avd-intent.json'),16384),intent=strictJson(intentBytes),createdBytes=privateBytes(join(root,'android-avd-created.json'),16384),created=strictJson(createdBytes);androidBound(intent,context);androidBound(created,context);
 onStage('AVD_INTENT');androidRequire(ownData(intent,['version','sourceHead','runId','attempt','nonce','home'])&&intent.version===1&&/^[a-f0-9]{64}$/.test(intent.nonce)&&intent.home===inode(privateDirectory(paths.avd)));
 onStage('AVD_DATA');const data=privateDirectory(paths.data);onStage('AVD_INDEX');const index=androidFile(paths.index);onStage('AVD_CONFIG');const config=androidFile(join(paths.data,'config.ini'));
 onStage('AVD_SCHEMA');androidRequire(ownData(created,['version','sourceHead','runId','attempt','intent','data','index','indexHash','config'])&&created.version===1);
 onStage('AVD_INTENT_BINDING');androidRequire(created.intent===receiptDigest(join(root,'android-avd-intent.json'),intentBytes));onStage('AVD_DATA_BINDING');androidRequire(created.data===inode(data));onStage('AVD_INDEX_BINDING');androidRequire(created.index===index.identity&&created.indexHash===index.hash);
 // The measured emulator replaces config.ini during startup. Bind the completed-boot
 // identity and bytes; fresh directory/index/creation authority remains immutable.
 onStage('AVD_PATH');androidRequire(index.bytes.toString('utf8').split(/\r?\n/).filter(line=>line.startsWith('path=')).join('\n')===`path=${paths.data}`);return {created:receiptDigest(join(root,'android-avd-created.json'),createdBytes),nonce:intent.nonce,config:config.identity,configHash:config.hash};
}
const androidRead=(env,args)=>execFileSync(join(env.ANDROID_HOME,'platform-tools/adb'),['-s','emulator-5554',...args],{timeout:10000,killSignal:'SIGKILL',maxBuffer:65536,encoding:'utf8',stdio:['ignore','pipe','pipe']}).replaceAll('\r','').trim();
// Verified 2026-10-16: AOSP main-emulator.cpp selects -headless for -no-window, replaces argv[0], then safe_execv with the original options.
// https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/emulator/main-emulator.cpp
function androidLive(root,env,onStage=()=>{}){onStage('PROCESS');const pid=privateBytes(join(root,'emulator.pid'),32).toString(),start=privateBytes(join(root,'emulator.start'),64).toString();androidRequire(/^[1-9][0-9]{0,9}$/.test(pid)&&Number(pid)>1&&/^[0-9]{1,24}$/.test(start));const stat=readFileSync(`/proc/${pid}/stat`,'utf8'),fields=stat.slice(stat.lastIndexOf(') ')+2).trim().split(/\s+/);androidRequire(fields[0]!=='Z'&&fields[19]===start);
 const emulator=env.SUBTRACK_PRIVATE_EMULATOR_BIN||join(env.ANDROID_HOME,'emulator/emulator');
 const exe=join(dirname(emulator),'qemu/linux-x86_64/qemu-system-x86_64-headless'),args=readFileSync(`/proc/${pid}/cmdline`).toString().split('\0');androidRequire(args.pop()==='');
 const expected=['-avd','subtrack-proof','-sysdir',join(env.ANDROID_HOME,'system-images/android-34/google_apis/x86_64'),'-port','5554','-no-window','-no-audio','-no-boot-anim','-no-snapshot','-gpu','swiftshader_indirect'];
 onStage('EXECUTABLE');androidRequire(realpathSync(exe)===readlinkSync(`/proc/${pid}/exe`));
 onStage('ARGUMENTS');androidRequire(args[0]===exe&&JSON.stringify(args.slice(1))===JSON.stringify(expected));
 onStage('ADB');androidRequire(androidRead(env,['get-state'])==='device'&&androidRead(env,['emu','avd','name'])==='subtrack-proof\nOK'&&androidRead(env,['shell','getprop','ro.kernel.qemu'])==='1'&&androidRead(env,['shell','getprop','sys.boot_completed'])==='1');return {pid,start,command:digest(Buffer.from(JSON.stringify(args)))};
}
/** Called around the actual avdmanager operation, not an asserted fresh:true flag. Exclusive receipts are immutable. */
export function androidAvdStage(root,context,phase,env,onStage=()=>{}){
 const paths=androidPaths(root);androidRequire(ownData(context,['sourceHead','runId','attempt']));
 if(phase==='begin'){androidRequire(!readdirSync(paths.avd).includes('subtrack-proof.avd')&&!readdirSync(paths.avd).includes('subtrack-proof.ini'));writeFileSync(join(root,'android-avd-intent.json'),JSON.stringify({version:1,...context,nonce:randomBytes(32).toString('hex'),home:inode(privateDirectory(paths.avd))}),{flag:'wx',mode:0o600});return;}
 if(phase==='created'){const bytes=privateBytes(join(root,'android-avd-intent.json'),16384),intent=strictJson(bytes);androidBound(intent,context);androidRequire(intent.home===inode(privateDirectory(paths.avd)));const data=privateDirectory(paths.data),index=androidFile(paths.index),config=androidFile(join(paths.data,'config.ini'));androidRequire(index.bytes.toString('utf8').split(/\r?\n/).filter(line=>line.startsWith('path=')).join('\n')===`path=${paths.data}`);writeFileSync(join(root,'android-avd-created.json'),JSON.stringify({version:1,...context,intent:receiptDigest(join(root,'android-avd-intent.json'),bytes),data:inode(data),index:index.identity,indexHash:index.hash,config:config.identity}),{flag:'wx',mode:0o600});androidCreated(root,context);return;}
 androidRequire(phase==='boot');onStage('CREATION');const creation=androidCreated(root,context,onStage),live=androidLive(root,env,onStage);onStage('RECEIPT');writeFileSync(join(root,'android-avd-boot.json'),JSON.stringify({version:1,...context,...creation,...live}),{flag:'wx',mode:0o600});
}
export function verifyAndroidDevice(root,context,env){const creation=androidCreated(root,context),live=androidLive(root,env),bytes=privateBytes(join(root,'android-avd-boot.json'),16384),boot=strictJson(bytes);androidBound(boot,context);androidRequire(ownData(boot,['version','sourceHead','runId','attempt','created','nonce','config','configHash','pid','start','command'])&&boot.version===1);for(const [key,value]of Object.entries({...creation,...live}))androidRequire(boot[key]===value);return receiptDigest(join(root,'android-avd-boot.json'),bytes);}
export function measureAndroidApp(root,context,env,built){const custody=verifyAndroidDevice(root,context,env);const stat=lstatSync(built);androidRequire(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=268435456);const hash=createHash('sha256');const fd=openSync(built,constants.O_RDONLY|constants.O_NOFOLLOW);try{const opened=fstatSync(fd);androidRequire(opened.dev===stat.dev&&opened.ino===stat.ino&&opened.size===stat.size);const bytes=readFileSync(fd),after=lstatSync(built);androidRequire(bytes.length===stat.size&&after.dev===stat.dev&&after.ino===stat.ino&&after.size===stat.size&&!after.isSymbolicLink());hash.update(bytes);}finally{closeSync(fd);}const builtHash=hash.digest('hex');const path=androidRead(env,['shell','pm','path','se.subtrack.app']);androidRequire(/^package:\/data\/app\/[A-Za-z0-9_~+/=.-]+\/base\.apk$/.test(path));const remote=androidRead(env,['shell','sha256sum',path.slice(8)]);androidRequire(remote===`${builtHash}  ${path.slice(8)}`);return Object.freeze({emulatorCustody:custody,installedApkSha256:builtHash});}
export function recordAndroidApp(root,context,measured){androidRequire(ownData(measured,['emulatorCustody','installedApkSha256']));writeFileSync(join(root,'android-app-custody.json'),JSON.stringify({version:1,...context,...measured}),{flag:'wx',mode:0o600});return receiptDigest(join(root,'android-app-custody.json'),privateBytes(join(root,'android-app-custody.json'),16384));}
function androidAppCustody(root,context,measured,checkpoint){const bytes=privateBytes(join(root,'android-app-custody.json'),16384);androidRequire(receiptDigest(join(root,'android-app-custody.json'),bytes)===checkpoint);const app=androidJson(join(root,'android-app-custody.json'));androidBound(app,context);androidRequire(ownData(app,['version','sourceHead','runId','attempt','emulatorCustody','installedApkSha256'])&&app.version===1&&app.emulatorCustody===measured.emulatorCustody&&app.installedApkSha256===measured.installedApkSha256);return app;}
export function prepareAndroidEntryMetadata(root,execution){let exit=false,close=false,invalid=false,taken=false,last;const invocation=randomUUID(),reader=prepareEnrollmentMetadata(root,execution,'android');return Object.freeze({record(event,code,signal){if(event==='exit'&&!exit&&!close&&code===1&&signal===null)exit=true;else if(event==='close'&&exit&&!close&&code===1&&signal===null)close=true;else invalid=true;},read(phase){last=reader.read(phase);return last;},take(result){if(taken)return null;taken=true;androidRequire(exit&&close&&!invalid);androidRequire(result===last&&enrollmentMetadataLines(result)!==null&&result.metadata==='AVAILABLE'&&result.command==='SCROLL_UNTIL_VISIBLE'&&result.target==='personal-title'&&result.occurrence==='ENTRY_HEADER');return Object.freeze({invocation});}});}
export function androidFixtureBinding(receipt,manual,markerHash){androidRequire(ownData(receipt,['version','markerHash','identityCount','profileCompleteCount','justMeCount','subscriptionCount','subscriptionDigest']));androidRequire(receipt.version===1&&receipt.markerHash===markerHash&&hash64(markerHash)&&receipt.identityCount===1&&receipt.profileCompleteCount===1&&receipt.justMeCount===1&&receipt.subscriptionCount===0&&hash64(receipt.subscriptionDigest));androidRequire(ownData(manual,['arrivals','finished201','rejected4xx','failed5xx','other','incomplete'])&&Object.values(manual).every(value=>value==='zero'));return digest(Buffer.from(JSON.stringify(receipt)));}
function androidAad(binding){androidRequire(ownData(binding,['version','purpose','sourceHead','runId','attempt','invocation','emulatorCustody','installedApkSha256','fixtureCustody','recipient']));androidRequire(binding.purpose==='android-entry-header');canonicalAad({version:binding.version,sourceHead:binding.sourceHead,runId:binding.runId,attempt:binding.attempt,invocation:binding.invocation,simulatorCustody:binding.emulatorCustody,recipient:binding.recipient});androidRequire(hash64(binding.installedApkSha256)&&hash64(binding.fixtureCustody));return Buffer.from(JSON.stringify({version:1,purpose:binding.purpose,sourceHead:binding.sourceHead,runId:binding.runId,attempt:binding.attempt,invocation:binding.invocation,emulatorCustody:binding.emulatorCustody,installedApkSha256:binding.installedApkSha256,fixtureCustody:binding.fixtureCustody,recipient:binding.recipient}));}
export function sealAndroidEntryPng(png,binding,pem){androidRequire(validAndroidPng(png));const recipient=createPublicKey(pem);androidRequire(recipient.asymmetricKeyType==='rsa'&&recipient.asymmetricKeyDetails.modulusLength===3072&&digest(recipient.export({type:'spki',format:'der'}))===PREINPUT_RECIPIENT_SHA256);const aad=androidAad(binding),key=randomBytes(32);try{const iv=randomBytes(12),wrapped=publicEncrypt({key:recipient,padding:cryptoConstants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256',oaepLabel:ANDROID_OAEP},key),cipher=createCipheriv('aes-256-gcm',key,iv,{authTagLength:16});cipher.setAAD(aad);const encrypted=Buffer.concat([cipher.update(png),cipher.final()]),size=Buffer.alloc(4);size.writeUInt32BE(aad.length);androidRequire(wrapped.length===384);return Buffer.concat([ANDROID_MAGIC,size,aad,iv,wrapped,cipher.getAuthTag(),encrypted]);}finally{key.fill(0);}}
export function validSealedAndroid(bytes,context,app){try{androidRequire(Buffer.isBuffer(bytes)&&bytes.length>=500&&bytes.length<=PREINPUT_LIMIT+4096&&bytes.subarray(0,10).equals(ANDROID_MAGIC));const n=bytes.readUInt32BE(10);androidRequire(n>0&&n<=2048&&bytes.length>=14+n+12+384+16+57);const aad=bytes.subarray(14,14+n),value=strictJson(aad);androidRequire(androidAad(value).equals(aad));androidBound(value,context);androidRequire(value.emulatorCustody===app.emulatorCustody&&value.installedApkSha256===app.installedApkSha256);return true;}catch{return false;}}
export function validatedAndroidArtifact(root,context){try{androidRequire(!existsSync(join(root,'android-entry-frame')));const base=captureRoot(root),app=androidJson(join(root,'android-app-custody.json'));androidBound(app,context);privateDirectory(join(base,'sealed-android'));return validSealedAndroid(privateBytes(join(base,'sealed-android','entry-header.st253sealed'),PREINPUT_LIMIT+4096),context,app);}catch{return false;}}
export async function captureSealedAndroidEntry({privateRoot,context,reader,metadata,measure,observe,markerHash,checkpoint,capture,recipientPem,onWithheld=()=>{}}){
 let raw,frame,png,sealedFile,published=false,stage='CUSTODY';
 try{
  const base=captureRoot(privateRoot);androidRequire(context!==null&&(process.umask()&0o077)===0o077);
  stage='METADATA_SHAPE';const ticket=reader.take(metadata);
  stage='CUSTODY';const measured=await measure();
  stage='APP_CUSTODY';androidAppCustody(privateRoot,context,measured,checkpoint);
  stage='API_BEFORE';const before=await observe(),fixture=androidFixtureBinding(before.receipt,before.manual,markerHash);
  stage='CAPTURE';frame=join(privateRoot,'android-entry-frame');mkdirSync(frame,{mode:0o700});privateDirectory(frame);raw=join(frame,'frame.png');await capture(raw);
  stage='PNG';png=privateBytes(raw,PREINPUT_LIMIT);androidRequire(validAndroidPng(png));await setImmediate();
  stage='API_AFTER';const after=await observe();androidRequire(androidFixtureBinding(after.receipt,after.manual,markerHash)===fixture);
  stage='CUSTODY';const again=await measure();androidRequire(JSON.stringify(again)===JSON.stringify(measured));
  stage='SEAL';const sealed=sealAndroidEntryPng(png,{version:1,purpose:'android-entry-header',...context,invocation:ticket.invocation,...measured,fixtureCustody:fixture,recipient:PREINPUT_RECIPIENT_SHA256},recipientPem);androidRequire(validSealedAndroid(sealed,context,measured));
  stage='RAW_CLEANUP';unlinkSync(raw);rmdirSync(frame);androidRequire(!existsSync(raw)&&!existsSync(frame));privateDirectory(privateRoot);
  stage='SEALED_OUTPUT';const output=join(base,'sealed-android');mkdirSync(output,{mode:0o700});privateDirectory(output);sealedFile=join(output,'entry-header.st253sealed');writeFileSync(sealedFile,sealed,{flag:'wx',mode:0o600});
  stage='SEALED_READBACK';published=validatedAndroidArtifact(privateRoot,context);return published;
 }catch{return false;}finally{
  png?.fill(0);
  if(!published&&sealedFile)try{unlinkSync(sealedFile);}catch{/* Never upload without readback. */}
  if(raw)try{if(existsSync(raw))unlinkSync(raw);if(existsSync(frame))rmdirSync(frame);}catch{stage='RAW_CLEANUP';}
  if(!published)onWithheld(stage);
 }
}
