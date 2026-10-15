import { normalizeIdentifier, type IdentifierResult } from '@subtrack/contracts/identifiers';
import type { EnrollmentError } from '@/api/mobileEnrollmentOtp';
export const SANDBOX_TEST_CODE = '000000';
export type OnboardingViewFlow =
 | { phase: 'identifier'; error?: EnrollmentError }
 | { phase: 'starting' }
 | { phase: 'otp'; cooldownUntil: number; pending: boolean; error?: EnrollmentError }
 | { phase: 'bankid'; pending?: boolean; error?: EnrollmentError };
type Identifier = Extract<IdentifierResult, { valid: true }>;
/** Local provider simulation. No contact value, challenge or proof is retained. */
export class SandboxOnboardingCore {
 private generation=0;
 private state:OnboardingViewFlow={phase:'identifier'};
 constructor(private readonly changed:(flow:OnboardingViewFlow)=>void,private readonly now=Date.now){}
 private update(flow:OnboardingViewFlow){this.state=Object.freeze(flow);this.changed(this.state);}
 reset(){this.generation++;this.update({phase:'identifier'});}
 start(identifier:Identifier):Promise<void>{
  if(this.state.phase!=='identifier')return Promise.resolve();
  if(!normalizeIdentifier(identifier.channel,identifier.identifier).valid){this.update({phase:'identifier',error:'restart'});return Promise.resolve();}
  this.update({phase:'otp',cooldownUntil:this.now()+30000,pending:false});return Promise.resolve();
 }
 verify(code:string):Promise<void>{
  if(this.state.phase!=='otp'||this.state.pending)return Promise.resolve();
  if(code!==SANDBOX_TEST_CODE){this.update({...this.state,error:'incorrect'});return Promise.resolve();}
  this.update({phase:'bankid'});return Promise.resolve();
 }
 resend():Promise<void>{
  if(this.state.phase==='otp'&&!this.state.pending&&this.now()>=this.state.cooldownUntil)this.update({phase:'otp',cooldownUntil:this.now()+30000,pending:false});
  return Promise.resolve();
 }
 login():Promise<'sandbox-confirmation-required'>{this.reset();this.update({phase:'bankid'});return Promise.resolve('sandbox-confirmation-required');}
 async complete(establish:()=>Promise<void>):Promise<'sandbox-session-ready'>{
  if(this.state.phase!=='bankid'||this.state.pending)throw new Error('Sandbox confirmation required');
  const ticket=++this.generation;this.update({phase:'bankid',pending:true});
  try{await establish();if(ticket!==this.generation)throw new Error('Sandbox flow obsolete');this.reset();return 'sandbox-session-ready';}
  catch{if(ticket===this.generation)this.update({phase:'bankid',error:'restart'});throw new Error('Sandbox session unavailable');}
 }
}
