import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import type {V2AccessToken} from '../sessions-v2/v2-access-token.js';
import type {OwnerTx} from '../sessions-v2/durable-current-web-authority.js';
import {DurablePrivateMobileAuthority} from './durable-mobile-authority.js';
const ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture(options:{badClean?:boolean;badRoles?:boolean;badFence?:boolean;ownerDeleted?:boolean;sessionGone?:boolean;workFault?:boolean;badCommit?:boolean;badRollback?:boolean;wrongRollback?:boolean;logoutLost?:boolean;releaseFault?:boolean;rejectTokenAt?:number;foreignClaimAt?:number}={}){
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
 const tokens={verify:vi.fn(()=>{verifies++;if(options.rejectTokenAt===verifies)throw new Error('expired');return {sub:options.foreignClaimAt===verifies?'foreign':ID,sid:SID};})} as unknown as V2AccessToken;
 const authority=new DurablePrivateMobileAuthority(pool,tokens,()=>now,'a'.repeat(64),{ownerRead:'SELECT owner_data'},true);
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
