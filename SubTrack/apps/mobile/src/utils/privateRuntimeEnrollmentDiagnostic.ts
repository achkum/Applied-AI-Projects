import {Platform} from 'react-native';

declare const process:{env:Record<string,string|undefined>};
export const ENROLLMENT_DIAGNOSTIC_STAGES=Object.freeze(['submit-valid','submit-invalid','start-accepted','start-ignored','config-accepted','config-rejected','entropy-accepted','entropy-rejected','fetch-entered','fetch-rejected','response-accepted','response-other','contract-accepted','contract-rejected','flow-committed','flow-obsolete'] as const);
export type EnrollmentDiagnosticStage=typeof ENROLLMENT_DIAGNOSTIC_STAGES[number];
export type EnrollmentDiagnostic=Readonly<{stage:(stage:EnrollmentDiagnosticStage)=>void;retire:()=>void}>;
type Gate=Readonly<{development:boolean;platform:string;proof?:string|undefined;enabled?:string|undefined;url?:string|undefined}>;
/** A memory-only channel with explicit immutable gate inputs; no caller data enters its sink. */
export function createEnrollmentDiagnosticChannel(readGate:()=>Gate,sink:(fixed:string)=>void=console.info.bind(console)){
 let calibration:object|null=null,invocation:object|null=null;
 function enabled(){try{const input=readGate();return input.development===true&&(input.platform==='ios'||input.platform==='android')&&input.proof==='true'&&input.enabled==='true'&&input.url==='https://localhost:3443';}catch{return false;}}
 function publish(message:string){try{sink(message);}catch{/* Passive delivery cannot affect original behavior. */}}
 function calibrate(){if(!enabled())return()=>{};const owner={};calibration=owner;invocation=null;publish('ST244_ENROLLMENT calibration=mounted');return()=>{if(calibration===owner){calibration=null;invocation=null;}};}
 function observe(stage:EnrollmentDiagnosticStage){if(enabled()&&calibration&&ENROLLMENT_DIAGNOSTIC_STAGES.includes(stage))publish(`ST244_ENROLLMENT stage=${stage}`);}
 function begin():EnrollmentDiagnostic|undefined{if(!enabled()||!calibration)return undefined;const owner=calibration,ticket={};invocation=ticket;return Object.freeze({stage(stage:EnrollmentDiagnosticStage){if(calibration===owner&&invocation===ticket)observe(stage);},retire(){if(invocation===ticket)invocation=null;}});}
 return Object.freeze({calibrate,observe,begin});
}
const runtime=createEnrollmentDiagnosticChannel(()=>({development:(globalThis as typeof globalThis&{__DEV__?:boolean}).__DEV__===true,platform:Platform.OS,proof:process.env.EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC,enabled:process.env.EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED,url:process.env.EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL}));
export const calibrateEnrollmentDiagnostic=runtime.calibrate;
export const observeEnrollmentStage=runtime.observe;
export const beginEnrollmentDiagnostic=runtime.begin;
export function emitEnrollmentDiagnostic(observer:EnrollmentDiagnostic|undefined,stage:EnrollmentDiagnosticStage){try{observer?.stage(stage);}catch{/* Observer failures preserve original request/result semantics. */}}
