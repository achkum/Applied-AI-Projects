import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {usePathname} from 'expo-router';
import type {IdentifierResult} from '@subtrack/contracts/identifiers';
import {useEnrollment} from './EnrollmentFlow';
import {useNativeSession} from './NativeSession';
import {useSandboxSession,sandboxBuildSelected} from './SandboxSession';
import {SandboxOnboardingCore,type OnboardingViewFlow} from './SandboxOnboardingCore';
export {SANDBOX_TEST_CODE} from './SandboxOnboardingCore';
type Identifier=Extract<IdentifierResult,{valid:true}>;
export interface OnboardingAdapter {
 provider:'production'|'sandbox';flow:OnboardingViewFlow;sessionPhase:ReturnType<typeof useNativeSession>['phase'];
 start(identifier:Identifier,locale?:'sv'|'en'):Promise<void>;verify(code:string):Promise<void>;resend():Promise<void>;reset():void;
 complete(locale:'sv'|'en'):Promise<'production-session-ready'|'sandbox-session-ready'>;
 login(locale:'sv'|'en'):Promise<'production-session-ready'|'sandbox-session-ready'>;logout():Promise<boolean>;
}
const Context=createContext<OnboardingAdapter|undefined>(undefined);
export function useOnboarding(){const value=useContext(Context);if(!value)throw new Error('Onboarding adapter required');return value;}
export function ProductionOnboardingProvider({children}:{children:React.ReactNode}){
 const enrollment=useEnrollment(),session=useNativeSession();
 const flow:OnboardingViewFlow=enrollment.flow.phase==='otp'?{phase:'otp',cooldownUntil:enrollment.flow.cooldownUntil,pending:enrollment.flow.pending,...(enrollment.flow.error?{error:enrollment.flow.error}:{})}:enrollment.flow.phase==='identifier'?{phase:'identifier',...(enrollment.flow.error?{error:enrollment.flow.error}:{})}:{phase:enrollment.flow.phase};
 const value:OnboardingAdapter={provider:'production',flow,sessionPhase:session.phase,start:enrollment.start,verify:enrollment.verify,resend:enrollment.resend,reset:enrollment.reset,
  async complete(locale){if(enrollment.flow.phase!=='bankid')throw new Error('Enrollment confirmation required');await session.complete(enrollment.flow.proof,locale);return 'production-session-ready';},
  async login(){await session.login();return 'production-session-ready';},logout:session.logout};
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function SandboxOnboardingProvider({children}:{children:React.ReactNode}){
 const session=useSandboxSession(),current=useRef(session);current.current=session;
 const [flow,setFlow]=useState<OnboardingViewFlow>({phase:'identifier'}),mounted=useRef(true),core=useRef<SandboxOnboardingCore|undefined>(undefined);
 if(!core.current)core.current=new SandboxOnboardingCore(next=>{if(mounted.current)setFlow(next);});
 const controller=core.current,path=usePathname(),previous=useRef(path);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.reset();};},[controller]);
 useEffect(()=>{const before=previous.current;previous.current=path;if(before===path)return;
  if(!['/register','/register-otp','/register-bankid'].includes(path)||(path==='/register'&&before!=='/welcome')||(path==='/register-otp'&&before==='/register-bankid'))controller.reset();
 },[path,controller]);
 const allowed=()=>{if(!sandboxBuildSelected()||!current.current.available)throw new Error('Sandbox unavailable');};
 const value:OnboardingAdapter={provider:'sandbox',flow,sessionPhase:session.phase,
  async start(identifier,locale='en'){allowed();await controller.register(identifier,()=>current.current.resumable?current.current.login():current.current.bootstrap(locale));},async verify(){throw new Error('Sandbox verification is not required');},async resend(){throw new Error('Sandbox verification is not required');},reset:()=>controller.reset(),
  async complete(){throw new Error('Sandbox verification is not required');},
  async login(locale){allowed();return controller.login(()=>current.current.resumable?current.current.login():current.current.bootstrap(locale));},logout:()=>current.current.logout()};
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
