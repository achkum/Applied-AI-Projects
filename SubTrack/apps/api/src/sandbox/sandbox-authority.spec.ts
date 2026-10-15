import {describe,it,expect,vi} from 'vitest';
import type {Pool,PoolClient} from 'pg';
import {generateKeyPairSync} from 'node:crypto';
import {SandboxAuthority,SandboxError} from './sandbox-authority.js';
import {SandboxToken} from './sandbox-token.js';
import {createSandboxConfig} from './sandbox-config.js';
const owner=['123e4567','e89b','42d3','a456','426614174000'].join('-'),session=['123e4567','e89b','42d3','a456','426614174001'].join('-');
function fixture(){
 let now=1000000;const pair=generateKeyPairSync('ed25519'),config=createSandboxConfig({NODE_ENV:'production',SUBTRACK_RUNTIME:'sandbox',SANDBOX_STARTUP_ENABLED:'true',SANDBOX_PUBLICATION_ENABLED:'true',SANDBOX_DATABASE_HOST:'database',SANDBOX_DATABASE_NAME:'subtrack_sandbox',SANDBOX_DATABASE_ROLE:'subtrack_sandbox_runtime',SANDBOX_POOL_MAX:'4',PORT:'4000'},{username:'subtrack_sandbox_api_login',password:'ab'.repeat(32)},{privateKeyPem:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),capabilityKey:'11'.repeat(32),refreshKey:'22'.repeat(32),admissionKey:'33'.repeat(32),rateKey:'44'.repeat(32),gatewayKey:'55'.repeat(32)},['aa'.repeat(32),'bb'.repeat(32),'cc'.repeat(32)]);
 const result=(command:string,rows:Record<string,unknown>[]=[])=>({command,rowCount:rows.length,rows});
 let override:((text:string,values:unknown[])=>ReturnType<typeof result>|undefined)|undefined;
 const query=vi.fn(async(text:string,values:unknown[]=[])=>{const custom=override?.(text,values);if(custom)return custom;
  if(text.startsWith('SELECT session_user'))return result('SELECT',[{login:'subtrack_sandbox_api_login',role:'subtrack_sandbox_api_login',db:'subtrack_sandbox',one:null,two:''}]);
  if(text==='SELECT id FROM st250_auth.capacity WHERE id=1 FOR UPDATE')return result('SELECT',[{id:1}]);
  if(text.startsWith('UPDATE st250_auth.epoch'))return result('UPDATE',[{watermark_ms:String(now)}]);
  if(text.startsWith('SELECT st250_auth.lock_owner'))return result('SELECT',[{id:values[0]}]);
  if(text.startsWith('SELECT se.expires_ms'))return result('SELECT',[{session_expires:'90000000',capability_expires:'2593000000'}]);
  if(text.includes('FROM pg_roles'))return result('SELECT',[{n:4}]);
  if(text==='SELECT id,sha256 FROM st250_auth.migration ORDER BY id')return result('SELECT',[{id:1,sha256:config.migrationHashes[0]},{id:2,sha256:config.migrationHashes[1]},{id:3,sha256:config.migrationHashes[2]}]);
  if(text.includes('FROM pg_class'))return result('SELECT',[{n:18}]);
  return result(text.split(' ')[0]!);
 });
 const release=vi.fn(),client={query,release} as unknown as PoolClient,pool={connect:vi.fn(async()=>client)} as unknown as Pick<Pool,'connect'>;
 const tokens=new SandboxToken(pair.privateKey,pair.publicKey,()=>now),authority=new SandboxAuthority(pool,tokens,config,()=>now),access=tokens.issue(owner,session,90000000);
 return {authority,tokens,access,client,pool,query,release,result,advance:(value:number)=>{now=value;},override:(value:typeof override)=>{override=value;}};
}
describe('sandbox current authority and disclosure fence',()=>{
 it('scopes both owner GUCs, uses only finite reviewed business statements and commits before disclosure',async()=>{const f=fixture();const value=await f.authority.withCurrentMobileAuthority(f.access,async(tx,principal)=>{expect(principal).toEqual({identityId:owner,sessionId:session});await tx.execute('profileRead',[owner]);await tx.execute('manualIdMint',[]);await tx.execute('manualSubscriptionInsert',[session,owner]);return {ok:true};});expect(value).toEqual({ok:true});expect(f.query.mock.calls.some(([text])=>text.includes("set_config('app.current_user_id'"))).toBe(true);expect(f.query.mock.calls.some(([text])=>text==='COMMIT')).toBe(true);expect(f.release).toHaveBeenCalledWith();});
 it('strictly denies invalid namespace, wrong owner params, unknown statements and escaped transaction ports',async()=>{
  await expect(fixture().authority.withCurrentMobileAuthority('private.token',async()=>1)).rejects.toMatchObject({kind:'denied'});
  for(const [name,values] of [['unregistered',[]],['profileRead',[session]],['manualIdMint',[owner]],['manualSubscriptionInsert',[owner,session]]] as const){const f=fixture();await expect(f.authority.withCurrentMobileAuthority(f.access,tx=>tx.execute(name,[...values]))).rejects.toMatchObject({kind:'unavailable'});}
  const f=fixture();let saved:Parameters<Parameters<SandboxAuthority['withCurrentMobileAuthority']>[1]>[0]|undefined;await f.authority.withCurrentMobileAuthority(f.access,async(tx)=>{saved=tx;return 1;});await expect(saved!.execute('profileRead',[owner])).rejects.toThrow();
 });
 it('rolls back bank quota failures and refuses foreign bank/purge parameters before SQL',async()=>{
  for(const name of ['bankRead','bankReceiptRead','bankConnect','bankTransactionUpsert','bankPurgeAccounts','bankPurgeTransactions']){const f=fixture();await expect(f.authority.withCurrentMobileAuthority(f.access,tx=>tx.execute(name,[session,owner]))).rejects.toMatchObject({kind:'unavailable'});expect(f.query.mock.calls.some(([text])=>text==='ROLLBACK')).toBe(true);expect(f.query.mock.calls.some(([text])=>text==='COMMIT')).toBe(false);}
  const f=fixture();f.override(text=>{if(text.startsWith('INSERT INTO st248_bank.receipt'))throw {code:'P0250'};return undefined;});await expect(f.authority.withCurrentMobileAuthority(f.access,tx=>tx.execute('bankReceiptInsert',[owner]))).rejects.toMatchObject({kind:'capacity'});expect(f.query.mock.calls.some(([text])=>text==='ROLLBACK')).toBe(true);expect(f.query.mock.calls.some(([text])=>text==='COMMIT')).toBe(false);
 });
 it('denies vanished owner/current capability/session and malformed durable time',async()=>{
  for(const target of ['scope','current','time']){const f=fixture();f.override(text=>target==='scope'&&text.startsWith('SELECT st250_auth.lock_owner')?f.result('SELECT'):target==='current'&&text.startsWith('SELECT se.expires_ms')?f.result('SELECT'):target==='time'&&text.startsWith('SELECT se.expires_ms')?f.result('SELECT',[{session_expires:'invalid',capability_expires:'2593000000'}]):undefined);await expect(f.authority.withCurrentMobileAuthority(f.access,async()=>1)).rejects.toThrow();expect(f.query.mock.calls.some(([text])=>text==='COMMIT')).toBe(false);}
  const f=fixture();f.override(text=>text.startsWith('SELECT se.expires_ms')?f.result('SELECT',[{session_expires:'9007199254740992',capability_expires:'2593000000'}]):undefined);await expect(f.authority.withCurrentMobileAuthority(f.access,async()=>1)).rejects.toThrow();
 });
 it('fails expiry during last awaited epoch and never yields after final token/time guard',async()=>{
  const expired=fixture(),short=expired.tokens.issue(owner,session,1001000);let epochs=0;expired.override(text=>{if(text.startsWith('UPDATE st250_auth.epoch')&&++epochs===2)queueMicrotask(()=>expired.advance(1001000));return undefined;});await expect(expired.authority.withCurrentMobileAuthority(short,async()=>1)).rejects.toMatchObject({kind:'denied'});expect(expired.query.mock.calls.some(([text])=>text==='COMMIT')).toBe(false);
  const valid=fixture(),events:string[]=[];const original=valid.tokens.verify.bind(valid.tokens);let calls=0;vi.spyOn(valid.tokens,'verify').mockImplementation(value=>{const claims=original(value);if(++calls===2)queueMicrotask(()=>{events.push('tick');valid.advance(1900000);});return claims;});valid.override(text=>{if(text==='COMMIT')events.push('dispatch');return undefined;});await valid.authority.withCurrentMobileAuthority(valid.access,async()=>1);expect(events).toEqual(['dispatch','tick']);
 });
 it('unknown commit, failed rollback and reset contamination withhold results and discard connections',async()=>{
  for(const fault of ['commit','rollback','clean-after','wrong-commit']){const f=fixture();let cleans=0;f.override(text=>{if(text.startsWith('SELECT session_user')&&++cleans===2&&fault==='clean-after')return f.result('SELECT',[{login:'wrong'}]);if(text==='COMMIT'&&fault==='commit'||text==='ROLLBACK'&&fault==='rollback')throw new Error('transport');if(text==='COMMIT'&&fault==='wrong-commit')return f.result('UNKNOWN');return undefined;});await expect(f.authority.transaction(async()=>{if(fault==='rollback')throw new SandboxError('denied');return {ok:true};})).rejects.toMatchObject({kind:'unavailable'});expect(f.release).toHaveBeenCalledWith(expect.any(Error));}
 });
 it('known rollback preserves only closed denial/restart/capacity types and timing limits',async()=>{
  for(const kind of ['denied','restart','capacity'] as const){const f=fixture();await expect(f.authority.transaction(async()=>{throw new SandboxError(kind);})).rejects.toMatchObject({kind});}
  const capacity=fixture();await expect(capacity.authority.transaction(async()=>{throw {code:'P0250'};})).rejects.toMatchObject({kind:'capacity'});const long=fixture();await expect(long.authority.transaction(async()=>{long.advance(1008000);return 1;})).rejects.toMatchObject({kind:'unavailable'});
  const guard=fixture();await expect(guard.authority.transaction(async()=>1,(()=>Promise.resolve()) as unknown as ()=>void)).rejects.toMatchObject({kind:'unavailable'});
  for(const time of [-1,0.5,Number.MAX_SAFE_INTEGER])expect(()=>{const f=fixture();f.advance(time);f.authority.now();}).toThrow();const backwards=fixture();backwards.authority.now();backwards.advance(999999);expect(()=>backwards.authority.now()).toThrow();
 });
 it('verifies immutable role/migration/forcedRLS roster and rejects missing capacity/epoch',async()=>{await fixture().authority.verifyStartup();for(const target of ['roles','migration','rls','capacity','epoch']){const f=fixture();f.override(text=>target==='roles'&&text.includes('FROM pg_roles')?f.result('SELECT',[{n:3}]):target==='migration'&&text==='SELECT id,sha256 FROM st250_auth.migration ORDER BY id'?f.result('SELECT',[{id:1,sha256:'wrong'},{id:2,sha256:'wrong'}]):target==='rls'&&text.includes('FROM pg_class')?f.result('SELECT',[{n:12}]):target==='capacity'&&text==='SELECT id FROM st250_auth.capacity WHERE id=1 FOR UPDATE'?f.result('SELECT'):target==='epoch'&&text.startsWith('UPDATE st250_auth.epoch')?f.result('UPDATE'):undefined);await expect(f.authority.verifyStartup()).rejects.toThrow();}});
 it('rejects unfinished work and caller guards before the final fence, not after it',async()=>{
  const pending=fixture();let complete:()=>void=()=>{};const held=new Promise<void>(ok=>{complete=ok;}),original=pending.query.getMockImplementation()!;pending.query.mockImplementation(async(text,values)=>{if(text.startsWith('SELECT display_name'))await held;return original(text,values);});let query:Promise<unknown>|undefined;await expect(pending.authority.withCurrentMobileAuthority(pending.access,async(tx)=>{query=tx.execute('profileRead',[owner]);return 1;})).rejects.toThrow();complete();await query;
  const accepted=fixture();expect(await accepted.authority.withCurrentMobileAuthority(accepted.access,async()=>1,()=>undefined)).toBe(1);const denied=fixture();await expect(denied.authority.withCurrentMobileAuthority(denied.access,async()=>1,()=> 'UNDO_EXPIRED')).rejects.toThrow();
 });
 it('denies last synchronous claim/expiry changes and masks generic rollback errors',async()=>{
  for(const change of ['sub','sid','session','capability','jwt'] as const){const f=fixture();if(change==='sub'||change==='sid'){const original=f.tokens.verify.bind(f.tokens);let count=0;vi.spyOn(f.tokens,'verify').mockImplementation(value=>{const claims=original(value);return ++count===2?{...claims,[change]:change==='sid'?owner:session}:claims;});}
   if(change==='session'||change==='capability')f.override(text=>text.startsWith('SELECT se.expires_ms')?f.result('SELECT',[{session_expires:change==='session'?'1000000':'90000000',capability_expires:change==='capability'?'1000000':'2593000000'}]):undefined);
   if(change==='jwt'){const original=f.tokens.verify.bind(f.tokens);let count=0;vi.spyOn(f.tokens,'verify').mockImplementation(value=>{const claims=original(value);if(++count===2)f.advance(1900000);return claims;});}
   await expect(f.authority.withCurrentMobileAuthority(f.access,async()=>1)).rejects.toMatchObject({kind:'denied'});
  }
  const error=fixture();await expect(error.authority.transaction(async()=>{throw new Error('unclassified');})).rejects.toMatchObject({kind:'unavailable'});const release=fixture();release.release.mockImplementation(()=>{throw new Error('release');});await expect(release.authority.transaction(async()=>{throw new Error('unclassified');})).rejects.toMatchObject({kind:'unavailable'});
 });
});
