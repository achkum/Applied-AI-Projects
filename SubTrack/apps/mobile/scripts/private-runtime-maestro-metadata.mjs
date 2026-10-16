import {Buffer} from 'node:buffer';
import {mkdirSync,lstatSync,realpathSync,readdirSync,openSync,fstatSync,readFileSync,closeSync,constants,writeFileSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import process from 'node:process';
import {createHash,createPublicKey,createCipheriv,publicEncrypt,randomBytes,randomUUID,constants as cryptoConstants} from 'node:crypto';
import {inflateSync,crc32} from 'node:zlib';
import {setImmediate} from 'node:timers/promises';
import {TextDecoder} from 'node:util';
const MAX_BYTES=4*1024*1024;
const KINDS=Object.freeze({tapOnElement:'TAP',inputTextCommand:'INPUT',hideKeyboardCommand:'HIDE_KEYBOARD',assertConditionCommand:'ASSERT_CONDITION',scrollUntilVisible:'SCROLL_UNTIL_VISIBLE',takeScreenshotCommand:'SCREENSHOT',applyConfigurationCommand:'CONFIGURATION'});
const STATUSES=['PENDING','RUNNING','COMPLETED','FAILED','WARNED','SKIPPED'];
const TARGETS=Object.freeze(['personal-title','profile-save','add-open','subscription-name','subscription-category','subscription-amount','date-field','subscription-save','saved-row','UNKNOWN']);
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
 const ids=Object.freeze({'native-personal-title':'personal-title','native-subscription-name':'subscription-name','native-subscription-amount':'subscription-amount','native-subscription-date':'date-field'});
 const texts=Object.freeze({'${MAESTRO_SAVE_PROFILE}':'profile-save','${MAESTRO_ADD}':'add-open','${MAESTRO_CATEGORY}':'subscription-category','${MAESTRO_SAVE_SUBSCRIPTION}':'subscription-save','Native restart proof':'saved-row'});
 const target=typeof id==='string'&&Object.hasOwn(ids,id)?ids[id]:typeof text==='string'&&Object.hasOwn(texts,text)?texts[text]:'UNKNOWN';
 return target!=='UNKNOWN'&&scroll.direction===(target==='personal-title'?'UP':'DOWN')?target:'UNKNOWN';
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
  const kind=commandKind(rows[index].command);if(kind==='CONFIGURATION'&&index!==1)return 'UNKNOWN';
  if(kind==='SCROLL_UNTIL_VISIBLE'){const target=scrollTarget(rows[index].command);if(target==='UNKNOWN')return 'UNKNOWN';if(target==='personal-title')headers++;}
 }
 return headers===0?'ENTRY_HEADER':headers===1?'SAVED_HEADER':'UNKNOWN';
}
/** Strict producer-shaped projection; payloads and error prose never classify a command. */
export function projectEnrollmentMetadata(bytes){
 try{const rows=strictJson(bytes);if(!Array.isArray(rows)||rows.length===0||rows.length>128)throw Error('invalid');let last=-1;const failed=[];
  for(const [index,row] of rows.entries()){if(!plain(row)||Object.keys(row).sort().join(',')!=='command,metadata')throw Error('invalid');validateMetadata(row.metadata);if(row.metadata.sequenceNumber<=last)throw Error('invalid');last=row.metadata.sequenceNumber;
   if(index===0){if(!plain(row.command)||Object.keys(row.command).join(',')!=='defineVariablesCommand'||!plain(row.command.defineVariablesCommand)||row.metadata.status!=='COMPLETED'||row.metadata.depth!==0)throw Error('invalid');continue;}
   const kind=commandKind(row.command);if(row.metadata.status==='FAILED'){if(row.metadata.depth!==0)throw Error('invalid');failed.push({kind,target:kind==='SCROLL_UNTIL_VISIBLE'?scrollTarget(row.command):'UNKNOWN'});}}
  return failed.length===1?closed('AVAILABLE',failed[0].kind,failed[0].target,failed[0].target==='personal-title'?headerOccurrence(rows):'UNKNOWN'):closed('UNAVAILABLE');
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
]);
/** Fresh enrollment output ownership is captured before its unchanged child invocation. */
function prepareCommandMetadata(privateRoot,execution,flowName,phaseName,project){
 let ownership=null,failed='UNKNOWN';
 const fail=name=>{if(failed==='UNKNOWN')failed=name;};
 const attempt=(name,operation)=>{try{return operation();}catch(error){fail(name);throw error;}};
 const require=(name,condition)=>{if(!condition){fail(name);throw Error('unavailable');}};
 function ownedDirectory(path,prefix){const stat=attempt(`${prefix}_STAT`,()=>lstatSync(path,{bigint:true}));require(`${prefix}_TYPE`,!stat.isSymbolicLink()&&stat.isDirectory());require(`${prefix}_CANONICAL`,attempt(`${prefix}_CANONICAL`,()=>realpathSync(path))===resolve(path));return stat;}
 function ownedInventory(path,prefix){const entries=attempt(`${prefix}_LIST`,()=>readdirSync(path,{withFileTypes:true}));require(`${prefix}_LIMIT`,entries.length<=32);return entries;}
 try{const parent=resolve(privateRoot),parentStat=ownedDirectory(parent,'CAPTURE_PARENT'),root=join(parent,flowName);attempt('CREATE_ROOT',()=>mkdirSync(root,{mode:0o700}));ownership={parent,parentStat,root,rootStat:ownedDirectory(root,'CAPTURE_ROOT')};}catch{/* No file errors or paths escape. */}
 return Object.freeze({metadataCheck:()=>failed,read(phase){
  let snapshot;try{snapshot=execution.snapshot();}catch{return null;}
  if(phase!==phaseName||!snapshot||!['launch-error','exit-nonzero','signal'].includes(snapshot.outcome))return null;
  if(!ownership)return closed('UNAVAILABLE');
  let descriptor=null;
  try{const {parent,parentStat,root,rootStat}=ownership;require('READ_PARENT_IDENTITY',same(ownedDirectory(parent,'READ_PARENT'),parentStat));require('READ_ROOT_IDENTITY',same(ownedDirectory(root,'READ_ROOT'),rootStat));
   const times=ownedInventory(root,'TIMESTAMP');require('TIMESTAMP_COUNT',times.length===1);require('TIMESTAMP_ENTRY_TYPE',!times[0].isSymbolicLink()&&times[0].isDirectory());require('TIMESTAMP_NAME',/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(times[0].name));
   const timestamp=join(root,times[0].name),timestampStat=ownedDirectory(timestamp,'TIMESTAMP');const flows=ownedInventory(timestamp,'FLOW');require('FLOW_COUNT',flows.length===1);require('FLOW_NAME',flows[0].name===`private-runtime-${flowName}`);require('FLOW_ENTRY_TYPE',!flows[0].isSymbolicLink()&&flows[0].isDirectory());
   const flow=join(timestamp,`private-runtime-${flowName}`),flowStat=ownedDirectory(flow,'FLOW');const entries=ownedInventory(flow,'BUNDLE');require('BUNDLE_SYMLINK',!entries.some(entry=>entry.isSymbolicLink()));
   const file=join(flow,'commands.json'),before=attempt('COMMAND_STAT',()=>lstatSync(file,{bigint:true}));require('COMMAND_TYPE',!before.isSymbolicLink()&&before.isFile());if(before.size>BigInt(MAX_BYTES))return closed('INVALID');require('COMMAND_EMPTY',before.size!==0n);
   require('COMMAND_CANONICAL',attempt('COMMAND_CANONICAL',()=>realpathSync(file))===resolve(file));descriptor=attempt('COMMAND_OPEN',()=>openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW));const opened=attempt('COMMAND_OPEN_STAT',()=>fstatSync(descriptor,{bigint:true}));require('COMMAND_OPEN_TYPE',opened.isFile());require('COMMAND_OPEN_IDENTITY',same(opened,before));require('COMMAND_OPEN_SIZE',opened.size===before.size);
   const bytes=attempt('COMMAND_READ',()=>readFileSync(descriptor)),after=attempt('COMMAND_AFTER_STAT',()=>lstatSync(file,{bigint:true}));require('COMMAND_AFTER_TYPE',!after.isSymbolicLink());require('COMMAND_AFTER_IDENTITY',same(after,opened));require('COMMAND_AFTER_SIZE',after.size===opened.size);
   require('FINAL_ROOT_IDENTITY',same(ownedDirectory(root,'FINAL_ROOT'),rootStat));require('FINAL_PARENT_IDENTITY',same(ownedDirectory(parent,'FINAL_PARENT'),parentStat));require('FINAL_TIMESTAMP_IDENTITY',same(ownedDirectory(timestamp,'FINAL_TIMESTAMP'),timestampStat));require('FINAL_FLOW_IDENTITY',same(ownedDirectory(flow,'FINAL_FLOW'),flowStat));return project(bytes);
  }catch{return closed('UNAVAILABLE');}finally{if(descriptor!==null)attempt('CLOSE',()=>closeSync(descriptor));}
 }});
}
export function prepareEnrollmentMetadata(privateRoot,execution){return prepareCommandMetadata(privateRoot,execution,'enroll-add','flow-enroll-add',projectEnrollmentMetadata);}
/** Only this exact fixed grammar may leave the private invocation. */
export function enrollmentMetadataLines(result){
 if(!plain(result)||Object.keys(result).sort().join(',')!=='command,errorClass,metadata,occurrence,target'||!['AVAILABLE','UNAVAILABLE','INVALID'].includes(result.metadata)||!['UNKNOWN',...Object.values(KINDS)].includes(result.command)||!TARGETS.includes(result.target)||!ENROLLMENT_HEADER_OCCURRENCES.includes(result.occurrence)||(result.occurrence!=='UNKNOWN'&&(result.metadata!=='AVAILABLE'||result.command!=='SCROLL_UNTIL_VISIBLE'||result.target!=='personal-title'))||(result.command!=='SCROLL_UNTIL_VISIBLE'&&result.target!=='UNKNOWN')||result.errorClass!=='UNKNOWN'||(result.metadata!=='AVAILABLE'&&result.command!=='UNKNOWN')||(result.metadata==='AVAILABLE'&&result.command==='UNKNOWN'))return null;
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
 let exit=false,closedExit=false,invalid=false,taken=false,failure='CHILD_LIFECYCLE';const invocation=randomUUID();
 const execution={snapshot:()=>({outcome:exit&&closedExit&&!invalid?'exit-nonzero':'unavailable'})};
 const reader=prepareCommandMetadata(privateRoot,execution,'identifier','flow-identifier',bytes=>Object.freeze({eligible:preinputWelcomeMetadata(bytes)}));
 return Object.freeze({record(event,code,signal){if(event==='error'){invalid=true;return;}if((event!=='exit'&&event!=='close')||code!==1||signal!==null){invalid=true;return;}if(event==='exit'){if(exit||closedExit)invalid=true;exit=true;}else{if(!exit||closedExit)invalid=true;closedExit=true;}},take(){if(taken)return null;taken=true;let result;try{result=reader.read('flow-identifier');}catch{failure='METADATA_OWNERSHIP';return null;}if(!exit||!closedExit||invalid)return null;failure=result.eligible===false||result.metadata==='INVALID'?'METADATA_SHAPE':'METADATA_OWNERSHIP';return result.eligible===true?Object.freeze({invocation}):null;},failureStage:()=>failure,ownershipCheck:()=>reader.metadataCheck()});
}
export function preinputCaptureContext(environment,head){
 try{const e=environment;if(e.ST253_CAPTURE_ENABLED!=='true'||e.ST253_CAPTURE_PLATFORM!=='ios'||e.ST253_CAPTURE_HEAD_REPOSITORY!=='achkum/Applied-AI-Projects'||e.NODE_ENV!=='development'||e.SUBTRACK_PRIVATE_DEVICE_PROOF!=='true'||e.EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC!=='true'||e.EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED!=='true'||e.EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL!=='https://localhost:3443'||e.GITHUB_REPOSITORY!=='achkum/Applied-AI-Projects'||e.GITHUB_EVENT_NAME!=='pull_request'||e.GITHUB_REF!=='refs/pull/293/merge'||e.GITHUB_HEAD_REF!=='codex/native-owner-search'||e.ST253_CAPTURE_SOURCE_HEAD!==head||!/^[a-f0-9]{40}$/.test(head)||! /^[1-9][0-9]{0,19}$/.test(e.GITHUB_RUN_ID)||! /^[1-9][0-9]{0,3}$/.test(e.GITHUB_RUN_ATTEMPT)||! /^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/.test(e.SUBTRACK_SIMULATOR_UDID))return null;
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
  let at=8,width=0,height=0,bpp=0,ended=false,seenData=false,dataEnded=false,ancillary=0,count=0;const compressed=[];
  while(at<bytes.length){if(++count>128||at+12>bytes.length)return false;const length=bytes.readUInt32BE(at),end=at+12+length;if(end>bytes.length)return false;const kind=bytes.toString('ascii',at+4,at+8),body=bytes.subarray(at+8,at+8+length);if(crc32(bytes.subarray(at+4,at+8+length))!==bytes.readUInt32BE(at+8+length))return false;
   if(kind==='IHDR'){if(at!==8||length!==13)return false;width=body.readUInt32BE(0);height=body.readUInt32BE(4);if(width<1||height<1||width>4096||height>4096||width*height>16777216||body[8]!==8||![2,6].includes(body[9])||body[10]!==0||body[11]!==0||body[12]!==0)return false;bpp=body[9]===2?3:4;}
   else if(kind==='IDAT'){if(!bpp||dataEnded)return false;seenData=true;compressed.push(body);}
   else if(kind==='IEND'){if(length!==0||end!==bytes.length||!seenData)return false;ended=true;}
   else{if(!bpp||!['gAMA','sRGB','cHRM','pHYs','iCCP'].includes(kind)||length>65536||(ancillary+=length)>262144)return false;if(seenData)dataEnded=true;
    if(kind==='iCCP'){const separator=body.indexOf(0);if(separator<1||separator>79||body[separator+1]!==0)return false;boundedInflate(body.subarray(separator+2),65536);}
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
export async function captureSealedPreinput({privateRoot,reader,context,observe,capture,recipientPem,onStage}){
 const stage=value=>{try{onStage?.(value);}catch{/* A diagnostic consumer cannot change qualification or eligibility. */}};
 let png,sealed,raw,frame,sealedFile,clean=false,published=false;
 try{stage('CUSTODY');const root=captureRoot(privateRoot);if(!context||(process.umask()&0o077)!==0o077)return false;stage('CHILD_LIFECYCLE');const ticket=reader.take();if(!ticket){const failure=reader.failureStage?.();stage(['METADATA_OWNERSHIP','METADATA_SHAPE'].includes(failure)?failure:'CHILD_LIFECYCLE');return false;}stage('CUSTODY');const custody=readCustody(privateRoot,context);stage('API_BEFORE');if(!zeroAllApi(observe()))return false;
  stage('CUSTODY');frame=join(privateRoot,'preinput-ios-frame');mkdirSync(frame,{mode:0o700});privateDirectory(frame);raw=join(frame,'frame.png');stage('APP_CUSTODY');await capture(raw,context.udid);stage('PNG');png=privateBytes(raw,PREINPUT_LIMIT);if(!validPreinputPng(png))return false;await setImmediate();stage('API_AFTER');if(!zeroAllApi(observe()))return false;
  stage('SEAL');sealed=sealPreinputPng(png,{version:1,sourceHead:context.sourceHead,runId:context.runId,attempt:context.attempt,invocation:ticket.invocation,simulatorCustody:custody,recipient:PREINPUT_RECIPIENT_SHA256},recipientPem);
  if(!validSealedPreinput(sealed,context,custody))return false;
  // Only encrypted bytes survive this scope; output creation happens strictly after raw absence.
  stage('RAW_CLEANUP');if(existsSync(raw))unlinkSync(raw);rmdirSync(frame);clean=!existsSync(raw)&&!existsSync(frame);if(!clean)return false;privateDirectory(privateRoot);
  stage('SEALED_OUTPUT');const directory=join(root,'sealed');mkdirSync(directory,{mode:0o700});privateDirectory(directory);sealedFile=join(directory,'preinput-ios.st253sealed');writeFileSync(sealedFile,sealed,{mode:0o600,flag:'wx'});stage('SEALED_READBACK');published=validatedPreinputArtifact(privateRoot,context);return published;
 }catch{return false;}finally{png?.fill(0);if(!published&&sealedFile)try{if(existsSync(sealedFile))unlinkSync(sealedFile);}catch{stage('RAW_CLEANUP');/* No upload is eligible without final validation. */}if(!clean&&raw)try{if(existsSync(raw))unlinkSync(raw);if(frame&&existsSync(frame))rmdirSync(frame);}catch{stage('RAW_CLEANUP');/* Cleanup failure cannot publish a sealed artifact. */}}
}
