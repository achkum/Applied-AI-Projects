import {Buffer} from 'node:buffer';
import {createRequire} from 'node:module';
import {URL} from 'node:url';
const mobileRequire=createRequire(new URL('../package.json',import.meta.url));
const expoRequire=createRequire(mobileRequire.resolve('expo/package.json'));
const configRequire=createRequire(expoRequire.resolve('@expo/config-plugins/package.json'));
const sax=createRequire(configRequire.resolve('xml2js/package.json'))('sax');
const fields=['version','markerHash','identityCount','profileCompleteCount','justMeCount','subscriptionCount','subscriptionDigest'];
const names=['welcome','verify','manage','month'];
function validReceipt(value,markerHash){
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&
 Object.keys(value).sort().join(',')===[...fields].sort().join(',')&&value.version===1&&
 ['identityCount','profileCompleteCount','justMeCount','subscriptionCount'].every(key=>value[key]===1)&&
 typeof markerHash==='string'&&/^[a-f0-9]{64}$/.test(markerHash)&&value.markerHash===markerHash&&
 typeof value.subscriptionDigest==='string'&&/^[a-f0-9]{64}$/.test(value.subscriptionDigest);
}
function validLabels(labels){return labels!==null&&typeof labels==='object'&&!Array.isArray(labels)&&Object.getPrototypeOf(labels)===Object.prototype&&Object.keys(labels).sort().join(',')===[...names].sort().join(',')&&names.every(name=>typeof labels[name]==='string'&&labels[name].length>0&&labels[name].length<=256);}
/** Presence only, never excerpts, parsed UI values or an acceptance assertion. */
export function restartUiPresence(bytes,labels){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>1048576||!validLabels(labels))return null;
 const xml=bytes.toString('utf8');
 if(!/^<\?xml[^>]*>\s*<hierarchy\b/.test(xml)||!xml.endsWith('</hierarchy>')||xml.includes('<!')||xml.includes('\ufffd'))return null;
 const result=Object.fromEntries([...names,'developer','routeError','linkChooser'].map(name=>[name,'unobserved']));
 const developer=['Development servers','Recently opened','Open in development build','Developer menu','Reload app','Reload','Open debugger'];
 const routeError=['Unmatched Route','Page could not be found.',"This screen doesn't exist.",'Render Error','Uncaught Error'];
 const chooser=['Just once','Always'];
 const seen=new Set();
 try{
  const parser=sax.parser(true);
  parser.onopentag=tag=>{
   if(!['hierarchy','node'].includes(tag.name))throw Error('Unsupported UI hierarchy');
   for(const attribute of ['text','content-desc']){
    const value=tag.attributes[attribute];
    for(const name of names)if(value===labels[name])result[name]='present';
    if([...developer,...routeError,...chooser].includes(value))seen.add(value);
   }
  };
  parser.write(xml).close();
  result.developer=developer.some(value=>seen.has(value))?'present':'unobserved';
  result.routeError=routeError.some(value=>seen.has(value))?'present':'unobserved';
  result.linkChooser=chooser.every(value=>seen.has(value))?'present':'unobserved';
 }catch{return null;}
 return Object.freeze(result);
}
export async function observeRestartUi({platform,phase,diagnostic,expected,markerHash,labels,observe,owned,capture,cleanup}){
 if(platform!=='android'||phase!=='flow-restart'||!diagnostic||diagnostic.withheld||!['commands','reasons','targets','metro','modules'].every(key=>Array.isArray(diagnostic[key]))||!validLabels(labels)||diagnostic.commands?.join(',')!=='wait-visible'||diagnostic.reasons?.join(',')!=='assertion'||!['bankid-verify','welcome-create-account'].includes(diagnostic.targets?.join(','))||diagnostic.metro?.length!==0||diagnostic.modules?.length!==0||!validReceipt(expected,markerHash))return null;
 let bytes=null,result=null,clean=false;
 try{
  const before=await observe();
  if(!validReceipt(before,markerHash)||!fields.every(key=>before[key]===expected[key])||await owned()!==true)return null;
  bytes=await capture();result=restartUiPresence(bytes,labels);
  const after=await observe();
  if(!validReceipt(after,markerHash)||!fields.every(key=>after[key]===expected[key])||await owned()!==true)result=null;
 }catch{result=null;}
 finally{
  if(Buffer.isBuffer(bytes))bytes.fill(0);
  try{clean=await cleanup()===true;}catch{clean=false;}
 }
 return clean?result:null;
}
