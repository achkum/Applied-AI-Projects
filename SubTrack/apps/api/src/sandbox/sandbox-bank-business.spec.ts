import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {SandboxAuthority} from './sandbox-authority.js';
const mocks=vi.hoisted(()=>({bank:vi.fn(),detect:vi.fn()}));
vi.mock('../banks/private-mobile-bank.js',()=>({createPrivateMobileBank:()=>({execute:mocks.bank})}));
vi.mock('../detection/private-mobile-detection.js',()=>({createPrivateMobileDetection:()=>({execute:mocks.detect})}));
import {createSandboxBankBusiness,SANDBOX_BANK_STATEMENTS} from './sandbox-bank-business.js';
const owner='123e4567-e89b-42d3-a456-426614174000',connection='123e4567-e89b-42d3-a456-426614174001';
beforeEach(()=>vi.resetAllMocks());
function fixture(){const execute=vi.fn(async(name:string)=>name==='modeRead'?{command:'SELECT',rowCount:1,rows:[{profile_complete:true,onboarding_mode:'just-me'}]}:name==='sandboxBankHistory'?{command:'SELECT',rowCount:0,rows:[]}:{command:name==='sandboxDetectionDates'?'UPDATE':'INSERT',rowCount:0,rows:[]});
 const authority={now:()=>Date.parse('2026-10-17T12:00:00Z'),withCurrentMobileAuthority:vi.fn(async(_token:string,action: (tx:unknown,owner:unknown)=>Promise<unknown>)=>action({execute},{identityId:owner,sessionId:connection}))} as unknown as SandboxAuthority;
 return {authority,execute,api:createSandboxBankBusiness(authority)};
}
describe('sandbox bank orchestration',()=>{
 it('connects, ingests and scans using current isolated authority and deterministic separate mutation keys',async()=>{
  mocks.bank.mockImplementation(async(_token,operation)=>({status:200,value:{operation,connection:{connectionId:connection}}}));mocks.detect.mockResolvedValue({status:200,value:{scan:'complete'}});
  const f=fixture(),key=owner;
  await f.api.execute('sandbox-token','bank-connect',{institutionId:'synthetic-demo-v1'},key);
  expect(mocks.bank.mock.calls.map(c=>c[1])).toEqual(['connect','sync']);expect(mocks.detect).toHaveBeenCalledWith('sandbox-token','scan',{},expect.any(String));
  expect(mocks.bank.mock.calls[1]![3]).not.toBe(key);const prior=mocks.bank.mock.calls[1]![3];
  await f.api.execute('sandbox-token','bank-connect',{institutionId:'synthetic-demo-v1'},key);expect(mocks.bank.mock.calls[3]![3]).toBe(prior);
  expect(f.execute.mock.calls.map(c=>c[0])).toContain('sandboxDetectionDates');
 });
 it('does not scan or fabricate success after bank conflicts, disconnect or read',async()=>{
  for(const op of ['connect','sync','disconnect','read']){const f=fixture();mocks.bank.mockResolvedValue({status:409,code:'BANK_STATE_CONFLICT'});expect(await f.api.execute('token',`bank-${op}`,{},'key')).toEqual({status:409,code:'BANK_STATE_CONFLICT'});}
  expect(mocks.detect).not.toHaveBeenCalled();
 });
 it('reads only the current owner booked history and uses sandbox final fences',async()=>{
  const f=fixture();expect(await f.api.execute('token','bank-history',{})).toEqual({status:200,value:{items:[],nextCursor:null}});
  expect(f.execute).toHaveBeenCalledWith('sandboxBankHistory',[owner]);
  expect(SANDBOX_BANK_STATEMENTS.detectionFinalFence).toContain('st250_auth.session');expect(SANDBOX_BANK_STATEMENTS.detectionFinalFence).not.toContain('st244_mobile');
 });
});
