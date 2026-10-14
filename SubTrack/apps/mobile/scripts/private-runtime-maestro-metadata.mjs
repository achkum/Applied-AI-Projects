import {mkdirSync,lstatSync,realpathSync,readdirSync,openSync,fstatSync,readFileSync,closeSync,constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {TextDecoder} from 'node:util';
const MAX_BYTES=4*1024*1024;
const KINDS=Object.freeze({tapOnElement:'TAP',inputTextCommand:'INPUT',hideKeyboardCommand:'HIDE_KEYBOARD',assertConditionCommand:'ASSERT_CONDITION',scrollUntilVisible:'SCROLL_UNTIL_VISIBLE',takeScreenshotCommand:'SCREENSHOT',applyConfigurationCommand:'CONFIGURATION'});
const STATUSES=['PENDING','RUNNING','COMPLETED','FAILED','WARNED','SKIPPED'];
const closed=(metadata,command='UNKNOWN')=>Object.freeze({metadata,command,errorClass:'UNKNOWN'});
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
function validateMetadata(metadata){
 if(!plain(metadata)||Object.keys(metadata).some(key=>!['status','sequenceNumber','depth','timestamp','duration','error','evaluatedCommand','artifacts'].includes(key))||!STATUSES.includes(metadata.status)||!integer(metadata.sequenceNumber)||!integer(metadata.depth)||metadata.depth>32)throw Error('invalid');
 for(const field of ['timestamp','duration'])if(Object.hasOwn(metadata,field)&&!integer(metadata[field]))throw Error('invalid');
 if(Object.hasOwn(metadata,'evaluatedCommand')&&!plain(metadata.evaluatedCommand))throw Error('invalid');
 if(Object.hasOwn(metadata,'error')){if(!plain(metadata.error)||Object.keys(metadata.error).some(key=>!['message','debugMessage'].includes(key))||Object.values(metadata.error).some(value=>typeof value!=='string'))throw Error('invalid');}
 if(Object.hasOwn(metadata,'artifacts')){if(!Array.isArray(metadata.artifacts)||metadata.artifacts.some(artifact=>!plain(artifact)||Object.keys(artifact).sort().join(',')!=='path,type'||typeof artifact.path!=='string'||typeof artifact.type!=='string'))throw Error('invalid');}
}
/** Strict producer-shaped projection; payloads and error prose never classify a command. */
export function projectEnrollmentMetadata(bytes){
 try{const rows=strictJson(bytes);if(!Array.isArray(rows)||rows.length===0||rows.length>128)throw Error('invalid');let last=-1;const failed=[];
  for(const [index,row] of rows.entries()){if(!plain(row)||Object.keys(row).sort().join(',')!=='command,metadata')throw Error('invalid');validateMetadata(row.metadata);if(row.metadata.sequenceNumber<=last)throw Error('invalid');last=row.metadata.sequenceNumber;
   if(index===0){if(!plain(row.command)||Object.keys(row.command).join(',')!=='defineVariablesCommand'||!plain(row.command.defineVariablesCommand)||row.metadata.status!=='COMPLETED'||row.metadata.depth!==0)throw Error('invalid');continue;}
   const kind=commandKind(row.command);if(row.metadata.status==='FAILED'){if(row.metadata.depth!==0)throw Error('invalid');failed.push(kind);}}
  return failed.length===1?closed('AVAILABLE',failed[0]):closed('UNAVAILABLE');
 }catch{return closed('INVALID');}
}
function directory(path){const stat=lstatSync(path,{bigint:true});if(stat.isSymbolicLink()||!stat.isDirectory()||realpathSync(path)!==resolve(path))throw Error('unavailable');return stat;}
const same=(left,right)=>left.dev===right.dev&&left.ino===right.ino;
function inventory(path){const entries=readdirSync(path,{withFileTypes:true});if(entries.length>32)throw Error('unavailable');return entries;}
/** Fresh enrollment output ownership is captured before its unchanged child invocation. */
export function prepareEnrollmentMetadata(privateRoot,execution){
 let ownership=null;
 try{const parent=resolve(privateRoot),parentStat=directory(parent),root=join(parent,'enroll-add');mkdirSync(root,{mode:0o700});ownership={parent,parentStat,root,rootStat:directory(root)};}catch{/* No file errors or paths escape. */}
 return Object.freeze({read(phase){
  let snapshot;try{snapshot=execution.snapshot();}catch{return null;}
  if(phase!=='flow-enroll-add'||!snapshot||!['launch-error','exit-nonzero','signal'].includes(snapshot.outcome))return null;
  if(!ownership)return closed('UNAVAILABLE');
  let descriptor=null;
  try{const {parent,parentStat,root,rootStat}=ownership;if(!same(directory(parent),parentStat)||!same(directory(root),rootStat))throw Error('unavailable');
   const times=inventory(root);if(times.length!==1||times[0].isSymbolicLink()||!times[0].isDirectory()||!/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(times[0].name))throw Error('unavailable');
   const timestamp=join(root,times[0].name);const timestampStat=directory(timestamp);const flows=inventory(timestamp);if(flows.length!==1||flows[0].name!=='private-runtime-enroll-add'||flows[0].isSymbolicLink()||!flows[0].isDirectory())throw Error('unavailable');
   const flow=join(timestamp,'private-runtime-enroll-add');const flowStat=directory(flow);const entries=inventory(flow);if(entries.some(entry=>entry.isSymbolicLink()))throw Error('unavailable');
   const file=join(flow,'commands.json'),before=lstatSync(file,{bigint:true});if(before.isSymbolicLink()||!before.isFile())throw Error('unavailable');if(before.size>BigInt(MAX_BYTES))return closed('INVALID');if(before.size===0n)return closed('UNAVAILABLE');
   if(realpathSync(file)!==resolve(file))throw Error('unavailable');descriptor=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);const opened=fstatSync(descriptor,{bigint:true});if(!opened.isFile()||!same(opened,before)||opened.size!==before.size)throw Error('unavailable');
   const bytes=readFileSync(descriptor);const after=lstatSync(file,{bigint:true});if(after.isSymbolicLink()||!same(after,opened)||after.size!==opened.size||!same(directory(root),rootStat)||!same(directory(parent),parentStat)||!same(directory(timestamp),timestampStat)||!same(directory(flow),flowStat))throw Error('unavailable');return projectEnrollmentMetadata(bytes);
  }catch{return closed('UNAVAILABLE');}finally{if(descriptor!==null)closeSync(descriptor);}
 }});
}
/** Only this exact fixed grammar may leave the private invocation. */
export function enrollmentMetadataLines(result){
 if(!plain(result)||Object.keys(result).sort().join(',')!=='command,errorClass,metadata'||!['AVAILABLE','UNAVAILABLE','INVALID'].includes(result.metadata)||!['UNKNOWN',...Object.values(KINDS)].includes(result.command)||result.errorClass!=='UNKNOWN'||(result.metadata!=='AVAILABLE'&&result.command!=='UNKNOWN')||(result.metadata==='AVAILABLE'&&result.command==='UNKNOWN'))return null;
 return Object.freeze([`enrollment-structured-metadata=${result.metadata}`,`enrollment-failed-command=${result.command}`,'enrollment-error-class=UNKNOWN']);
}
