import { normalizeIdentifier, type IdentifierResult } from '@subtrack/contracts/identifiers';
import type { EnrollmentError } from '@/api/mobileEnrollmentOtp';
export const SANDBOX_TEST_CODE = '000000';
export type OnboardingViewFlow =
 | { phase: 'identifier'; error?: EnrollmentError }
 | { phase: 'starting' }
 | { phase: 'otp'; cooldownUntil: number; pending: boolean; error?: EnrollmentError }
 | { phase: 'bankid'; pending?: boolean; error?: EnrollmentError };
type Identifier = Extract<IdentifierResult, { valid: true }>;
/** Uses only the isolated sandbox session; no OTP or identity proof is fabricated. */
export class SandboxOnboardingCore {
 private generation=0;
 private state:OnboardingViewFlow={phase:'identifier'};
 constructor(private readonly changed:(flow:OnboardingViewFlow)=>void){}
 private update(flow:OnboardingViewFlow){this.state=Object.freeze(flow);this.changed(this.state);}
 reset(){this.generation++;this.update({phase:'identifier'});}
 async register(identifier:Identifier,establish:()=>Promise<void>):Promise<void>{
  if(!normalizeIdentifier(identifier.channel,identifier.identifier).valid)throw new Error('Invalid identifier');
  await this.enter(establish);
 }
 login(establish:()=>Promise<void>):Promise<'sandbox-session-ready'>{return this.enter(establish);}
 private async enter(establish:()=>Promise<void>):Promise<'sandbox-session-ready'>{
  if(this.state.phase==='starting')throw new Error('Sandbox session pending');
  const ticket=++this.generation;this.update({phase:'starting'});
  try{await establish();if(ticket!==this.generation)throw new Error('Sandbox flow obsolete');this.reset();return 'sandbox-session-ready';}
  catch{if(ticket===this.generation)this.update({phase:'identifier',error:'restart'});throw new Error('Sandbox session unavailable');}
 }
}
