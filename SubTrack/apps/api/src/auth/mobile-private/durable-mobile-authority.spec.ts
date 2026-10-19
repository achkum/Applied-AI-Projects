import {PRIVATE_BANK_PURGE_STATEMENTS} from '../../banks/private-mobile-bank-statements.js';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import type {V2AccessToken} from '../sessions-v2/v2-access-token.js';
import type {OwnerTx} from '../sessions-v2/durable-current-web-authority.js';
import {DurablePrivateMobileAuthority,PrivateMobileUndoExpiredError,type PrivateMobilePrecommitGuard} from './durable-mobile-authority.js';
const ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture(options:{badClean?:boolean;badRoles?:boolean;badFence?:boolean;ownerDeleted?:boolean;sessionGone?:boolean;workFault?:boolean;badCommit?:boolean;badRollback?:boolean;wrongRollback?:boolean;logoutLost?:boolean;releaseFault?:boolean;rejectTokenAt?:number;foreignClaimAt?:number;foreignSessionAt?:number;expireAfterPrecommit?:boolean}={},statements:Readonly<Record<string,string>>={ownerRead:'SELECT owner_data'}){
 vi.stubEnv('NODE_ENV','development');let now=1000;let verifies=0;const calls:string[]=[];const release=vi.fn(()=>{if(options.releaseFault)throw new Error('release');});
 const query=vi.fn(async(sql:string)=>{calls.push(sql);const q=(command:string,rows:Record<string,unknown>[],rowCount=rows.length)=>({command,rows,rowCount});
  if(sql.startsWith('SELECT session_user'))return q('SELECT',[{login:options.badClean?'foreign':'subtrack_dev_auth_login',role:'subtrack_dev_auth_login',db:'st237_private_https_profile',one:'',two:''}]);
  if(sql.includes('pg_catalog.pg_roles'))return q('SELECT',[{n:options.badRoles?'3':'4'}]);
  if(sql.startsWith('UPDATE st244_mobile.epoch'))return q('UPDATE',options.badFence?[]:[{now:'1000'}]);
  if(sql==='COMMIT')return q(options.badCommit?'OTHER':'COMMIT',[]);if(sql==='ROLLBACK'){if(options.badRollback)throw new Error('rollback');return q(options.wrongRollback?'OTHER':'ROLLBACK',[]);}
  if(sql.includes('FROM public.identity'))return q('SELECT',options.ownerDeleted?[]:[{id:ID}]);
  if(sql.includes('FROM st244_mobile.session'))return q('SELECT',options.sessionGone?[]:[{id:SID}]);
  if(sql.startsWith('UPDATE st244_mobile.session'))return q('UPDATE',[],options.logoutLost?0:1);
  if(sql==='SELECT owner_data'){if(options.workFault)throw new Error('rawstorage-secret');return q('SELECT',[{safe:true}]);}
  return q(sql.startsWith('BEGIN')?'BEGIN':sql.startsWith('SET')?'SET':'SELECT',[]);
 });
 const pool={connect:async()=>({query,release} as unknown as PoolClient)} as unknown as Pick<Pool,'connect'>;
 const tokens={verify:vi.fn(()=>{verifies++;if(options.expireAfterPrecommit&&verifies===4)queueMicrotask(()=>{now=2000;});if(options.rejectTokenAt===verifies||(options.expireAfterPrecommit&&now>=2000))throw new Error('expired');return {sub:options.foreignClaimAt===verifies?'foreign':ID,sid:options.foreignSessionAt===verifies?'foreign':SID};})} as unknown as V2AccessToken;
 const authority=new DurablePrivateMobileAuthority(pool,tokens,()=>now,'a'.repeat(64),statements,true);
 return {authority,pool,tokens,calls,query,release,setNow:(n:number)=>{now=n;}};
}
afterEach(()=>vi.unstubAllEnvs());
describe('durable current native owner authority',()=>{
 it('locks active owner/current mobile session and confines named owner work to known commit',async()=>{const f=fixture();let saved:OwnerTx|undefined;const result=await f.authority.withCurrentMobileAuthority('access',async(tx,owner)=>{saved=tx;expect(owner).toEqual({identityId:ID,sessionId:SID});return (await tx.execute('ownerRead',[ID])).rows;});expect(result).toEqual([{safe:true}]);expect(f.calls).toContain('COMMIT');await expect(saved!.execute('ownerRead',[ID])).rejects.toThrow('Mobile authority unavailable');expect(f.release).toHaveBeenCalledWith();});
 it('acknowledged logout revokes only trusted owner/session and commits no secrets',async()=>{const f=fixture();await f.authority.logout('access');expect(f.calls.some(q=>q.includes('SET revoked_ms'))).toBe(true);expect(f.calls).toContain('COMMIT');});
 for(const options of [{ownerDeleted:true},{sessionGone:true},{rejectTokenAt:2},{foreignClaimAt:2},{rejectTokenAt:4}])it(`rejects lost current authority ${JSON.stringify(options)} with rollback and no disclosure`,async()=>{const f=fixture(options);await expect(f.authority.withCurrentMobileAuthority('access',async()=>({private:true}))).rejects.toMatchObject({kind:'denied'});expect(f.calls).toContain('ROLLBACK');expect(f.calls).not.toContain('COMMIT');});
 it('invalid initial token never acquires PG for business or logout',async()=>{for(const operation of ['read','logout']){const f=fixture({rejectTokenAt:1});await expect(operation==='read'?f.authority.withCurrentMobileAuthority('bad',async()=>undefined):f.authority.logout('bad')).rejects.toMatchObject({kind:'denied'});expect(f.query).not.toHaveBeenCalled();}});
 for(const options of [{badClean:true},{badRoles:true},{badFence:true},{workFault:true},{badCommit:true},{workFault:true,badRollback:true},{workFault:true,releaseFault:true},{workFault:true,wrongRollback:true}])it(`masks storage/uncertainty ${JSON.stringify(options)} and discards pool connection`,async()=>{const f=fixture(options);await expect(f.authority.withCurrentMobileAuthority('access',async tx=>tx.execute('ownerRead',[ID]))).rejects.toMatchObject({kind:'unavailable'});expect(f.release).toHaveBeenCalledWith(expect.any(Error));if(options.badCommit)expect(f.calls).not.toContain('ROLLBACK');});
 it('unknown named statement and client nonarray values are rejected without SQL',async()=>{for(const [name,values] of [['foreign',[]],['ownerRead',null]] as const){const f=fixture();await expect(f.authority.withCurrentMobileAuthority('access',async tx=>tx.execute(name,values as unknown as readonly unknown[]))).rejects.toMatchObject({kind:'unavailable'});expect(f.calls).not.toContain('SELECT owner_data');}});
 it('rejects outstanding unawaited owner work before commit',async()=>{const f=fixture();const original=f.query.getMockImplementation()!;let resolve:((value:unknown)=>void)|undefined;f.query.mockImplementation(async sql=>{if(sql==='SELECT owner_data')return await new Promise<unknown>(r=>{resolve=r;}) as never;return original(sql);});let pending:Promise<unknown>|undefined;await expect(f.authority.withCurrentMobileAuthority('access',async tx=>{pending=tx.execute('ownerRead',[]);return 'private';})).rejects.toMatchObject({kind:'unavailable'});expect(f.calls).not.toContain('COMMIT');resolve?.({command:'SELECT',rows:[],rowCount:0});await pending;});
 it('awaits precommit verification and rolls back its failure rather than disclosing work',async()=>{const f=fixture();const order:string[]=[];await expect(f.authority.transaction('subtrack_identity_provisioner',async()=>{order.push('work');return 'secret';},async()=>{await Promise.resolve();order.push('final');throw new Error('expiry');})).rejects.toMatchObject({kind:'unavailable'});expect(order).toEqual(['work','final']);expect(f.calls).toContain('ROLLBACK');});
 it.each([NaN,-1,Number.MAX_SAFE_INTEGER,999])('rejects invalid/backwards clock %s before work',n=>{const f=fixture();f.authority.now();f.setNow(n);expect(()=>f.authority.now()).toThrow();});
 it('default-disabled, malformed manifest, and unsafe named SQL cannot construct authority',()=>{const f=fixture();for(const [enabled,manifest,statements] of [[false,'a'.repeat(64),{}],[true,'bad',{}],[true,'a'.repeat(64),{unsafe:'SELECT x; COMMIT'}],[true,'a'.repeat(64),{'bad-name':'SELECT x'}],[true,'a'.repeat(64),{unsafe:'DELETE x'}]] as const)expect(()=>new DurablePrivateMobileAuthority(f.pool,f.tokens,()=>1000,manifest,statements,enabled)).toThrow();});
 it('logout rejects deleted/current-revoked/late expired authority and retains denial privacy',async()=>{for(const options of [{ownerDeleted:true},{sessionGone:true},{rejectTokenAt:3},{logoutLost:true}]){const f=fixture(options);await expect(f.authority.logout('access')).rejects.toMatchObject({kind:'denied'});expect(f.calls).toContain('ROLLBACK');}});
});

describe('frozen owner Synthetic purge capability',()=>{
 it('accepts only the exact approved name AND entire constant, never SQL normalization',()=>{
  const f=fixture();
  expect(()=>new DurablePrivateMobileAuthority(f.pool,f.tokens,()=>1000,'a'.repeat(64),PRIVATE_BANK_PURGE_STATEMENTS,true)).not.toThrow();
  for(const [name,sql] of Object.entries(PRIVATE_BANK_PURGE_STATEMENTS)){
   for(const statements of [{[name]:sql+' '},{[name]:sql.replace('$2','$3')},{[name+'Other']:sql},{[name]:sql.replace('REVOKED','ACTIVE')},{[name]:sql+' -- comment'},{[name]:'SELECT owner_data'}]){
    expect(()=>new DurablePrivateMobileAuthority(f.pool,f.tokens,()=>1000,'a'.repeat(64),statements,true)).toThrow();
   }
  }
  for(const sql of ["SELECT 'quoted'",'DELETE FROM public.raw_transaction','SELECT x -- comment'])expect(()=>new DurablePrivateMobileAuthority(f.pool,f.tokens,()=>1000,'a'.repeat(64),{other:sql},true)).toThrow();
 });
 it('rejects wrong arity, foreign owner and invalid connection before touching approved DELETE',async()=>{
  for(const values of [[],[ID],[SID,SID],[ID,'not-uuid'],[ID,SID,'extra']]){
   const f=fixture({},PRIVATE_BANK_PURGE_STATEMENTS);
   await expect(f.authority.withCurrentMobileAuthority('access',async tx=>tx.execute('bankPurgeAccounts',values))).rejects.toMatchObject({kind:'unavailable'});
   expect(f.calls).not.toContain(PRIVATE_BANK_PURGE_STATEMENTS.bankPurgeAccounts);
  }
 });
 it('executes approved text with only two validated current-owner values',async()=>{
  const f=fixture({},PRIVATE_BANK_PURGE_STATEMENTS);
  await f.authority.withCurrentMobileAuthority('access',async tx=>tx.execute('bankPurgeAccounts',[ID,SID]));
  expect(f.query).toHaveBeenCalledWith(PRIVATE_BANK_PURGE_STATEMENTS.bankPurgeAccounts,[ID,SID]);
 });
});

describe('synchronous final Undo deadline business fence',()=>{
 it('rejects token expiry in the earlier precommit microtask gap before calling the business guard',async()=>{
  const f=fixture({expireAfterPrecommit:true}),guard=vi.fn(()=>undefined);
  await expect(f.authority.withCurrentMobileAuthority('access',async()=>({private:true}),guard)).rejects.toMatchObject({kind:'denied'});
  expect(guard).not.toHaveBeenCalled();expect(f.calls).toContain('ROLLBACK');expect(f.calls).not.toContain('COMMIT');
 });
 it.each([{foreignClaimAt:5},{foreignSessionAt:5},{rejectTokenAt:5}])('revalidates final immutable owner and session %j',async options=>{
  const f=fixture(options),guard=vi.fn(()=>undefined);
  await expect(f.authority.withCurrentMobileAuthority('access',async()=>undefined,guard)).rejects.toMatchObject({kind:'denied'});
  expect(guard).not.toHaveBeenCalled();expect(f.calls).toContain('ROLLBACK');expect(f.calls).not.toContain('COMMIT');
 });
 it('dispatches COMMIT before any microtask scheduled by the final business guard',async()=>{
  const f=fixture();let committedBeforeMicrotask=false;
  await f.authority.withCurrentMobileAuthority('access',async()=>undefined,()=>{queueMicrotask(()=>{committedBeforeMicrotask=f.calls.includes('COMMIT');});return undefined;});
  expect(committedBeforeMicrotask).toBe(true);
 });
 it('transaction final guard rejects invalid and async results without dispatching COMMIT',async()=>{
  for(const guard of [1,async()=>undefined,()=>null]){const f=fixture();await expect(f.authority.transaction('subtrack_identity_provisioner',async()=>undefined,undefined,guard as ()=>void)).rejects.toMatchObject({kind:'unavailable'});expect(f.calls).toContain('ROLLBACK');expect(f.calls).not.toContain('COMMIT');}
 });
 it('runs after last epoch await and token verification with no await before commit',async()=>{
  const f=fixture();const guard=vi.fn(()=>{expect(f.calls.filter(q=>q.startsWith('UPDATE st244_mobile.epoch'))).toHaveLength(2);expect(f.tokens.verify).toHaveBeenCalledTimes(5);expect(f.calls).not.toContain('COMMIT');return undefined;});
  await expect(f.authority.withCurrentMobileAuthority('access',async()=>({safe:true}),guard)).resolves.toEqual({safe:true});expect(guard).toHaveBeenCalledOnce();expect(f.calls.at(-3)).toBe('COMMIT');
 });
 it.each([1001,1002])('fresh equality/advance %s after final awaited epoch rolls back before commit',async now=>{
  const f=fixture(),original=f.query.getMockImplementation()!;let epochs=0;
  f.query.mockImplementation(async sql=>{const value=await original(sql);if(sql.startsWith('UPDATE st244_mobile.epoch')&&++epochs===2)f.setNow(now);return value;});
  await expect(f.authority.withCurrentMobileAuthority('access',async()=>({private:'not-returned'}),()=>f.authority.now()<1001?undefined:'UNDO_EXPIRED')).rejects.toBeInstanceOf(PrivateMobileUndoExpiredError);
  expect(f.calls).toContain('ROLLBACK');expect(f.calls).not.toContain('COMMIT');
 });
 it.each([{badRollback:true},{wrongRollback:true}])('known expiry with unknown rollback is unavailable %j',async options=>{
  const f=fixture(options);await expect(f.authority.withCurrentMobileAuthority('access',async()=>undefined,()=> 'UNDO_EXPIRED')).rejects.toMatchObject({kind:'unavailable'});expect(f.calls).not.toContain('COMMIT');
 });
 it('successful replay without deadline guard stays valid and uncertainty cannot become expiry',async()=>{
  const f=fixture({badCommit:true});await expect(f.authority.withCurrentMobileAuthority('access',async()=>({receipt:true}))).rejects.toMatchObject({kind:'unavailable'});expect(f.calls).not.toContain('ROLLBACK');
 });
 it('invalid/async/throwing/spoofed business guard never emits known expiry',async()=>{
  const guards:unknown[]=[1,()=>null,()=> 'other',async()=>undefined,()=>({then(){throw new Error('private');}}),()=>{throw new Error('UNDO_EXPIRED');},()=>{throw new PrivateMobileUndoExpiredError();}];
  for(const guard of guards){const f=fixture();await expect(f.authority.withCurrentMobileAuthority('access',async()=>undefined,guard as PrivateMobilePrecommitGuard)).rejects.toMatchObject({kind:'unavailable'});expect(f.calls).toContain('ROLLBACK');expect(f.calls).not.toContain('COMMIT');}
 });
 it('last token rejection or clock regression cannot become a business conflict',async()=>{
  const f=fixture({rejectTokenAt:4}),guard=vi.fn(()=> 'UNDO_EXPIRED' as const);await expect(f.authority.withCurrentMobileAuthority('access',async()=>undefined,guard)).rejects.toMatchObject({kind:'denied'});expect(guard).not.toHaveBeenCalled();
  const g=fixture();await expect(g.authority.withCurrentMobileAuthority('access',async()=>undefined,()=>{g.setNow(999);g.authority.now();return 'UNDO_EXPIRED';})).rejects.toMatchObject({kind:'unavailable'});
 });
 it('detection named values cannot nominate a foreign first owner parameter',async()=>{
  const f=fixture({}, {detectionModeRead:'SELECT owner_data'});await expect(f.authority.withCurrentMobileAuthority('access',async tx=>tx.execute('detectionModeRead',[SID]))).rejects.toMatchObject({kind:'unavailable'});expect(f.calls).not.toContain('SELECT owner_data');
  const g=fixture({}, {detectionModeRead:'SELECT owner_data'});await expect(g.authority.withCurrentMobileAuthority('access',async tx=>tx.execute('detectionModeRead',[ID]))).resolves.toMatchObject({rows:[{safe:true}]});
 });
});
