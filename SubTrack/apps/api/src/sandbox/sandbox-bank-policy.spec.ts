import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {sandboxStatement,isSandboxBankOperation,SANDBOX_BANK_OPERATIONS} from './sandbox-bank-policy.js';
import {PRIVATE_MOBILE_BANK_STATEMENTS,PRIVATE_BANK_PURGE_STATEMENTS} from '../banks/private-mobile-bank-statements.js';
import {createPrivateMobileBank} from '../banks/private-mobile-bank.js';
const owner='123e4567-e89b-42d3-a456-426614174000',connection='123e4567-e89b-42d3-a456-426614174001';
const migration=readFileSync(resolve(__dirname,'../../prisma/sandbox/003-sandbox-synthetic-bank.sql'),'utf8');
describe('public bank closed source SQL and owner parameter policy',()=>{
 it('maps only four public operations and copies immutable data-only parameters',()=>{
  expect(SANDBOX_BANK_OPERATIONS).toEqual({'bank-read':'read','bank-connect':'connect','bank-sync':'sync','bank-disconnect':'disconnect'});for(const name of Object.keys(SANDBOX_BANK_OPERATIONS))expect(isSandboxBankOperation(name)).toBe(true);for(const name of ['bank','connect','__proto__','constructor','bank-purge'])expect(isSandboxBankOperation(name)).toBe(false);
  const values=[owner,null,true,1,2n,Buffer.from('safe')],statement=sandboxStatement('profileRead',values,owner);expect(statement.values).toEqual(values);expect(statement.values).not.toBe(values);expect(Object.isFrozen(statement)).toBe(true);expect(Object.isFrozen(statement.values)).toBe(true);expect(sandboxStatement('manualIdMint',[],owner).values).toEqual([]);expect(sandboxStatement('manualSubscriptionInsert',[connection,owner],owner).values[1]).toBe(owner);
  for(const [name,sql]of Object.entries(PRIVATE_MOBILE_BANK_STATEMENTS)){expect(sandboxStatement(name,[owner,connection],owner).sql).toBe(sql);}
 });
 it('rejects foreign owners, unknown names, extra purge parameters and hostile argument metadata without invocation',()=>{
  let reads=0;const accessor=[owner];Object.defineProperty(accessor,0,{get(){reads++;throw Error('private');}});const hidden=[owner];Object.defineProperty(hidden,0,{value:owner,enumerable:false});const extra=Object.assign([owner],{private:true}),proxy=new Proxy([owner],{get(){reads++;throw Error('private');}}),proxyValue=new Proxy(Buffer.from('private'),{get(){reads++;throw Error('private');}});
  const invalid:readonly [unknown,unknown,unknown][]=[['profileRead',[owner],'invalid'],['profileRead',[owner],null],[null,[owner],owner],['unregistered',[owner],owner],['profileRead',null,owner],['profileRead',proxy,owner],['profileRead',Object.setPrototypeOf([owner],null),owner],['profileRead',extra,owner],['profileRead',Object.assign(new Array(2),{1:owner}),owner],['profileRead',accessor,owner],['profileRead',hidden,owner],['profileRead',[owner,proxyValue],owner],['profileRead',[owner,{}],owner],['profileRead',[owner,undefined],owner],['profileRead',[owner,NaN],owner],['profileRead',[owner,()=>undefined],owner],['profileRead',[connection],owner],['manualIdMint',[owner],owner],['manualSubscriptionInsert',[owner,connection],owner],['bankPurgeAccounts',[owner],owner],['bankPurgeAccounts',[owner,1],owner],['bankPurgeAccounts',[owner,'not-uuid'],owner],['bankPurgeAccounts',[owner,connection,true],owner]];
  for(const [name,values,id]of invalid)expect(()=>sandboxStatement(name as string,values as unknown[],id as string)).toThrow('Sandbox statement unavailable');expect(reads).toBe(0);
 });
 it('rejects a tampered frozen purge mapping instead of accepting a new DELETE',async()=>{
  vi.resetModules();vi.doMock('../banks/private-mobile-bank-statements.js',()=>({PRIVATE_BANK_PURGE_STATEMENTS,PRIVATE_MOBILE_BANK_STATEMENTS:{...PRIVATE_MOBILE_BANK_STATEMENTS,bankPurgeAccounts:'DELETE FROM public.identity'}}));
  try{const module=await import('./sandbox-bank-policy.js');expect(()=>module.sandboxStatement('bankPurgeAccounts',[owner,connection],owner)).toThrow();}finally{vi.doUnmock('../banks/private-mobile-bank-statements.js');vi.resetModules();}
 });
});
describe('actual migration quota predicate and non-destructive storage boundaries',()=>{
 it('executes the source receipt reservation condition at cleanup/replay capacity boundaries',()=>{
  const expression=/IF (retained\+1\+reserved>256) THEN/.exec(migration)![1]!;
  const rejects=new Function('retained','reserved',`return ${expression}`) as (r:number,reserved:number)=>boolean;
  expect(rejects(253,2)).toBe(false);expect(rejects(254,2)).toBe(true); // Last unreserved sync versus exhaustion.
  expect(rejects(254,1)).toBe(false);expect(rejects(255,0)).toBe(false); // Active -> retained revoke -> purge.
  expect(rejects(254,0)).toBe(false); // Direct purge uses one receipt and releases both reserved slots.
  expect(rejects(256,0)).toBe(true); // A fresh no-op cannot append beyond the closed budget.
  expect(migration).toContain("CASE WHEN bc.status='ACTIVE' THEN 2 ELSE 1 END");expect(migration).toContain('bg.purged_at IS NULL');expect(migration).toContain('retained excludes NEW');expect(migration).toContain('FOR UPDATE');
 });
 it('keeps replay available without a new receipt or mutation at the full capacity',async()=>{
  const body={connectionId:connection,purge:true},requestHash=createHash('sha256').update(JSON.stringify({version:'solberg-v1',operation:'disconnect',body})).digest();
  const execute=vi.fn(async(name:string)=>name==='modeRead'?{command:'SELECT',rowCount:1,rows:[{profile_complete:true,onboarding_mode:'just-me'}]}:name==='bankReceiptRead'?{command:'SELECT',rowCount:1,rows:[{request_h:requestHash,operation:'disconnect',connection_id:connection,status:'REVOKED',disposition:'purged',account_count:0,transaction_count:0,last_sync_at:null}]}:Promise.reject(Error('Unexpected mutation')));
  const authority={now:()=>1000000,withCurrentMobileAuthority:async<T>(_token:string,action:(tx:{execute:typeof execute},principal:{identityId:string;sessionId:string})=>Promise<T>)=>action({execute},{identityId:owner,sessionId:connection})};
  const bank=createPrivateMobileBank(authority as unknown as Parameters<typeof createPrivateMobileBank>[0]);expect(await bank.execute('opaque','disconnect',body,connection)).toMatchObject({status:200,value:{connection:{disposition:'purged'}}});expect(execute.mock.calls.map(([name])=>name)).toEqual(['modeRead','bankReceiptRead']);
 });
 it('caps lifetime tombstones and new raw rows while existing charge upserts consume no growth slot',()=>{
  for(const bound of ['>=50','>=4350','>=87','retained+1+reserved>256'])expect(migration).toContain(bound);
  expect(migration).toContain('IF NOT EXISTS(SELECT 1 FROM public.raw_transaction WHERE identity_id=owner_id AND account_id=NEW.account_id AND provider_transaction_id=NEW.provider_transaction_id)');expect(migration).toContain("bg.fixture_version='solberg-v1'");expect(migration).toContain('NOT public.subtrack_principal_matches(owner_id)');
  for(const table of ['public.bank_connection','public.bank_account','public.raw_transaction','st248_bank.generation','st248_bank.receipt'])expect(migration).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
  expect(migration).toContain('GRANT DELETE ON public.raw_transaction,public.bank_account TO subtrack_sandbox_runtime;');expect(migration).not.toMatch(/CASCADE|BYPASSRLS|CREATE ROLE|TRUNCATE|DELETE FROM public.identity|DELETE FROM public.subscription/);expect(migration).not.toMatch(/^BEGIN;|^COMMIT;/m);expect(migration).toContain("current_setting('st250.previous_manifest')");expect(migration).toContain("INSERT INTO st250_auth.migration VALUES(3,current_setting('st250.bank_sha256'))");
 });
});
