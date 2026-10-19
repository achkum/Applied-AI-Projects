import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';

export const IOS_FRAME_FAILURES=Object.freeze(['SPAWN','OUTPUT_LIMIT','TERMINATED','EXIT_NONZERO','OTHER']);
export function iosFrameFailure(error){
 try{
 if(['ENOENT','EACCES','EPERM'].includes(error?.code))return 'SPAWN';
 if(error?.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')return 'OUTPUT_LIMIT';
 if(error?.killed===true||error?.signal==='SIGKILL'||error?.signal==='SIGTERM')return 'TERMINATED';
 if(Number.isInteger(error?.code)&&error.code>0&&error.code<=255)return 'EXIT_NONZERO';
 return 'OTHER';
 }catch{return 'OTHER';}
}
function boundedCommand(binary,args,onFailure,execute){
 return new Promise((accept,reject)=>{
  const failed=error=>{const category=iosFrameFailure(error);try{onFailure?.(category);}catch{/* Observation cannot authorize readiness. */}reject(Object.assign(Error('iOS frame command unavailable'),{iosFrameFailure:category}));};
 try{execute(binary,args,{timeout:60000,killSignal:'SIGKILL',maxBuffer:65536,encoding:'utf8'},error=>error?failed(error):accept());}catch(error){failed(error);}
 });
}
export function openOwnedIosSimulator(udid,onFailure,{execute=execFile}={}){
 assert.match(udid,/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/);
 // Match pinned Maestro cli-2.11.0 launch arguments; no renderer defaults changes.
 // Run39173532433 returned GUI/TERMINATED under the former 10s bound; cause unproven.
 // Allow one 60s setup call; no retries or partial readiness are accepted.
 // https://github.com/mobile-dev-inc/Maestro/blob/cli-2.11.0/maestro-ios-driver/src/main/kotlin/util/LocalSimulatorUtils.kt#L111-L125
 return boundedCommand('/usr/bin/open',['-a','/Applications/Xcode_26.2.app/Contents/Developer/Applications/Simulator.app','--args','-CurrentDeviceUDID',udid],onFailure,execute);
}
