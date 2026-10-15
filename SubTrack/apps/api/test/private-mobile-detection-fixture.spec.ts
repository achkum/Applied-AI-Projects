import {describe,it,expect} from 'vitest';
import {OwnedDetectionController,OWNED_DETECTION_SCENARIOS} from './private-mobile-owned-fixture-observer.js';
import {PRIVATE_MOBILE_DETECTION_STATEMENTS as sql} from '../src/detection/private-mobile-detection-statements.js';
import type {PoolClient} from 'pg';
import {prepareOwnedDetectionOverflow,restoreOwnedDetectionOverflow} from './private-mobile-owned-fixture.js';

const overflowOwner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',overflowAccount='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',overflowConnection='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function overflowFixture(){
 const rows=Array.from({length:3},(_,i)=>({id:`eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12,'0')}`,identity_id:overflowOwner,account_id:overflowAccount,connection_id:overflowConnection,amount:String(-14900-i),date:`2026-${String(i+7).padStart(2,'0')}-01`,currency:'SEK',description:['NETFLIX','Netflix','NETFLIX.COM'][i]!,fixture_version:'solberg-v1',connection_status:'ACTIVE',revoked_at:null,purged_at:null,last_synced_at:new Date('2026-10-01T00:00:00Z')}));
 let data:Record<string,unknown>[]=rows.map(row=>({...row})),snapshot:Record<string,unknown>[]|undefined,updates=0,failAt=0,drift=false;
 const calls:{operation:string;values:readonly unknown[]|undefined}[]=[];
 const query=async(text:string,values?:readonly unknown[])=>{
  const operation=['BEGIN','COMMIT','ROLLBACK'].includes(text)?text:text.startsWith('SELECT')?'READ':'WRITE';calls.push({operation,values});
  if(operation==='BEGIN'){snapshot=data.map(row=>({...row}));updates=0;return {command:'BEGIN',rowCount:null,rows:[]};}
  if(operation==='COMMIT'){snapshot=undefined;return {command:'COMMIT',rowCount:null,rows:[]};}
  if(operation==='ROLLBACK'){if(snapshot)data=snapshot;snapshot=undefined;return {command:'ROLLBACK',rowCount:null,rows:[]};}
  if(operation==='READ'){expect(values?.[0]).toBe(overflowOwner);expect(values?.[1]).toEqual(['NETFLIX','Netflix','NETFLIX*','NETFLIX.COM']);return {command:'SELECT',rowCount:data.length,rows:data.map(row=>({...row}))};}
  updates++;if(updates===failAt)throw new Error('private storage failure');
  expect(values?.slice(0,4)).toEqual([overflowOwner,overflowAccount,overflowConnection,'SEK']);const row=data.find(row=>row.id===values?.[4]);if(!row||row.amount!==values?.[5])return {command:'UPDATE',rowCount:0,rows:[]};row.amount=values?.[6];
  return {command:'UPDATE',rowCount:1,rows:[{id:drift?overflowAccount:row.id}]};
 };
 return {client:{query} as unknown as Pick<PoolClient,'query'>,calls,rows:()=>data,replace:(value:Record<string,unknown>[])=>{data=value;},fail:(at:number)=>{failAt=at;},drift:()=>{drift=true;},originals:rows.map(row=>({...row}))};
}
describe('real-detector overflow cohort and atomic fixture custody',()=>{
 it('proves a recurring fully-overflowing cohort before writes and restores each exact original amount',async()=>{
  const f=overflowFixture(),cohort=await prepareOwnedDetectionOverflow(f.client,overflowOwner);expect(f.calls.map(call=>call.operation)).toEqual(['BEGIN','READ','WRITE','WRITE','WRITE','COMMIT']);expect(f.rows().every(row=>row.amount==='-9223372036854775808')).toBe(true);expect(Object.isFrozen(cohort)).toBe(true);expect(Object.isFrozen(cohort.originals)).toBe(true);
  await restoreOwnedDetectionOverflow(f.client,cohort);expect(f.rows()).toEqual(f.originals);expect(f.calls.slice(6).map(call=>call.operation)).toEqual(['BEGIN','READ','WRITE','WRITE','WRITE','COMMIT']);await expect(restoreOwnedDetectionOverflow(f.client,cohort)).rejects.toThrow('Fixture unavailable');
 });
 it('rejects incomplete, duplicate, foreign, stale, ambiguous, untrusted and nonrecurring cohorts before mutation',async()=>{
  for(const patch of [{identity_id:overflowAccount},{account_id:overflowConnection},{connection_id:overflowAccount},{currency:'USD'},{description:'private descriptor'},{fixture_version:'stale'},{connection_status:'REVOKED'},{revoked_at:new Date()},{purged_at:new Date()},{last_synced_at:null},{id:'substituted'},{date:'2026-02-30'},{amount:'1'},{amount:'-9223372036854775809'}]){
   const f=overflowFixture();Object.assign(f.rows()[1]!,patch);await expect(prepareOwnedDetectionOverflow(f.client,overflowOwner)).rejects.toThrow('Fixture unavailable');expect(f.calls.some(call=>call.operation==='WRITE')).toBe(false);expect(f.calls.at(-1)!.operation).toBe('ROLLBACK');
  }
  for(const kind of ['short','duplicate','overbound','nonrecurring','already-overflowing']){const f=overflowFixture();if(kind==='short')f.replace(f.rows().slice(0,2));if(kind==='duplicate')f.rows()[1]!.id=f.rows()[0]!.id;if(kind==='overbound')f.replace(Array(10001).fill(f.rows()[0]!));if(kind==='nonrecurring'){f.rows()[1]!.date='2026-09-15';f.rows()[2]!.date='2026-12-28';}if(kind==='already-overflowing')for(const row of f.rows())row.amount='-9223372036854775808';await expect(prepareOwnedDetectionOverflow(f.client,overflowOwner)).rejects.toThrow('Fixture unavailable');expect(f.calls.some(call=>call.operation==='WRITE')).toBe(false);}
 });
 it('rolls back partial perturbation and substituted UPDATE outcomes',async()=>{
  const f=overflowFixture();f.fail(2);await expect(prepareOwnedDetectionOverflow(f.client,overflowOwner)).rejects.toThrow();expect(f.rows()).toEqual(f.originals);expect(f.calls.at(-1)!.operation).toBe('ROLLBACK');
  const drift=overflowFixture();drift.drift();await expect(prepareOwnedDetectionOverflow(drift.client,overflowOwner)).rejects.toThrow('Fixture unavailable');expect(drift.rows()).toEqual(drift.originals);
 });
 it('rejects substituted/stale restoration and atomically rolls back a partial restore',async()=>{
  for(const change of ['missing','extra','foreign','stale','amount','description']){const f=overflowFixture(),cohort=await prepareOwnedDetectionOverflow(f.client,overflowOwner);if(change==='missing')f.replace(f.rows().slice(1));if(change==='extra')f.replace([...f.rows(),{...f.rows()[0]!,id:overflowAccount}]);if(change==='foreign')f.rows()[0]!.identity_id=overflowAccount;if(change==='stale')f.rows()[0]!.fixture_version='stale';if(change==='amount')f.rows()[0]!.amount='-1';if(change==='description')f.rows()[0]!.description='private';const before=f.rows().map(row=>({...row}));await expect(restoreOwnedDetectionOverflow(f.client,cohort)).rejects.toThrow('Fixture unavailable');expect(f.rows()).toEqual(before);expect(f.calls.at(-1)!.operation).toBe('ROLLBACK');}
  const f=overflowFixture(),cohort=await prepareOwnedDetectionOverflow(f.client,overflowOwner),perturbed=f.rows().map(row=>({...row}));await expect(restoreOwnedDetectionOverflow(f.client,{...cohort})).rejects.toThrow('Fixture unavailable');f.fail(2);await expect(restoreOwnedDetectionOverflow(f.client,cohort)).rejects.toThrow();expect(f.rows()).toEqual(perturbed);f.fail(0);await restoreOwnedDetectionOverflow(f.client,cohort);expect(f.rows()).toEqual(f.originals);
 });
});
const owner='owned-owner';
async function original(control:OwnedDetectionController){control.verified(owner,'owned-session');await control.query(sql.detectionReceiptInsert,[owner,'owned-receipt','owned-candidate','confirm',null,null,null,null,null,null,null,'1970-01-01T02:00:10.000Z'],async()=>({command:'INSERT',rowCount:1}));await control.query('COMMIT',undefined,async()=>({command:'COMMIT',rowCount:null}));}
const result=async()=>({command:'SELECT',rowCount:1});
async function bind(c:OwnedDetectionController){await c.query(sql.detectionReceiptLock,[owner,null,'owned-receipt',null,null],result);await c.query(sql.detectionReceiptLock,[owner,'owned-candidate',null,'undo',Buffer.alloc(32)],result);await c.query(sql.detectionCandidateLock,[owner,'owned-candidate'],result);}
describe('owned detection deadline fault custody',()=>{
 it('default wallclock and positive enable remain isolated',()=>{const c=new OwnedDetectionController();expect(c.enabled()).toBe(false);expect(c.now()).toBeGreaterThan(0);expect(()=>c.arm('undo-equality-entry',10800000)).toThrow();c.enable(10800000);expect(c.now()).toBe(7200000);expect(()=>c.enable(10800000)).toThrow();});
 it('cannot arm until real inserted original commits or fake deadline is beyond observed PGwall',async()=>{const c=new OwnedDetectionController();c.enable(10800000);expect(()=>c.arm('undo-equality-entry',10800000)).toThrow();await original(c);expect(c.binding()?.deadline).toBe(7210000);c.arm('undo-equality-entry',10800000);await bind(c);expect(c.now()).toBe(7210000);expect(c.observation().fired).toBe(true);expect(()=>c.arm('undo-equality-entry',10800000)).toThrow();});
 it('fourth verification microtask advances before awaited continuation',async()=>{const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-beforecommit-microtask',10800000);await bind(c);for(let i=0;i<4;i++)c.verified(owner,'owned-session');expect(c.now()).toBe(7200000);await Promise.resolve();expect(c.now()).toBe(7210000);c.verified(owner,'owned-session');expect(c.observation().verifies).toBe(5);expect(()=>c.verified(owner,'owned-session')).toThrow();});
 it('final synchronous verification has no yield before actual COMMIT dispatch',async()=>{const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-finalverify-microtask-order',10800000);await bind(c);for(let i=0;i<5;i++)c.verified(owner,'owned-session');let dispatched=0;const pending=c.query('COMMIT',undefined,async()=>{dispatched++;return {command:'COMMIT',rowCount:null};});expect(dispatched).toBe(1);expect(c.observation().commitBeforeTick).toBe(true);await pending;expect(c.now()).toBe(7210000);});
 it('transport faults execute real rollback/commit and never replace their outcome with rows',async()=>{for(const [scenario,command] of [['review-commit-before','ROLLBACK'],['review-commit-after','COMMIT']] as const){const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm(scenario,10800000);await bind(c);const actual:string[]=[];await expect(c.query('COMMIT',undefined,async(text)=>{actual.push(text);return {command:text,rowCount:null};})).rejects.toThrow();expect(actual).toEqual([command]);c.released(true);expect(c.observation().discarded).toBe(true);}});
 it('scope and exact SQL source prevent unrelated token or similar query from activating a fault',async()=>{
  for(const [user,session] of [['foreign-owner','owned-session'],[owner,'foreign-session']]){const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-final-fence',10800000);expect(()=>c.verified(user!,session!)).toThrow();expect(c.observation().fired).toBe(false);}
  const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-final-fence',10800000);await bind(c);await c.query(sql.detectionFinalFence+' ',undefined,result);expect(c.observation().fired).toBe(false);await c.query(sql.detectionFinalFence,[owner,'owned-session',7200000,'just-me'],result);expect(c.observation().fired).toBe(true);c.clear();expect(c.now()).toBe(7210000);expect(OWNED_DETECTION_SCENARIOS).toHaveLength(10);
 });
 it('all expiry/rollback boundaries honor actual query execution ordering',async()=>{
  for(const scenario of ['undo-expiry-after-final-fence','undo-expiry-finalverify-sync','undo-expiry-rollback-before','undo-expiry-rollback-after'] as const){
   const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm(scenario,10800000);await bind(c);
   if(scenario==='undo-expiry-finalverify-sync'){for(let i=0;i<5;i++)c.verified(owner,'owned-session');}else await c.query(sql.detectionFinalFence,[owner,'owned-session',7200000,'just-me'],async()=>({command:'SELECT',rowCount:1}));
   expect(c.now()).toBe(7210000);const executed:string[]=[];
   if(scenario.startsWith('undo-expiry-rollback')){await expect(c.query('ROLLBACK',undefined,async(text)=>{executed.push(text);return {command:'ROLLBACK',rowCount:null};})).rejects.toThrow();expect(executed).toEqual(scenario.endsWith('after')?['ROLLBACK']:[]);}else await c.query('ROLLBACK',undefined,async()=>({command:'ROLLBACK',rowCount:null}));
  }
 });
 it('epoch fault is limited to second byte-exact source statement and controller retains time after clear',async()=>{
  const fs=await import('node:fs/promises');const path=await import('node:path');const source=await fs.readFile(path.resolve(__dirname,'../src/auth/mobile-private/durable-mobile-authority.ts'),'utf8');const exact=source.match(/client\.query\('(UPDATE st244_mobile\.epoch[^']+)'/)?.[1];expect(exact).toBeTruthy();
  const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-epoch',10800000);await bind(c);await c.query('BEGIN ISOLATION LEVEL READ COMMITTED',undefined,async()=>({command:'BEGIN',rowCount:null}));
  await c.query(exact!,undefined,async()=>({command:'UPDATE',rowCount:1}));expect(c.now()).toBe(7200000);await c.query(exact!,undefined,async()=>({command:'UPDATE',rowCount:1}));expect(c.now()).toBe(7210000);c.clear();expect(c.now()).toBe(7210000);
 });
 it('rejects out-of-bound clock or malformed original binding; rollback never latches a result',async()=>{
  for(const time of [0,NaN,1.5])expect(()=>new OwnedDetectionController().enable(time)).toThrow();
  const c=new OwnedDetectionController();c.enable(10800000);c.verified(owner,'owned-session');await c.query('SELECT unrelated',undefined,async()=>({command:'SELECT',rowCount:0}));c.released(false);
  await expect(c.query(sql.detectionReceiptInsert,[null,'r','c','reject',null,null,null,null,null,null,null,'invalid'],async()=>({command:'INSERT',rowCount:1}))).rejects.toThrow();
  await c.query(sql.detectionReceiptInsert,[owner,'r','c','confirm',null,null,null,null,null,null,null,'1970-01-01T02:00:10.000Z'],async()=>({command:'INSERT',rowCount:1}));await c.query('ROLLBACK',undefined,async()=>({command:'ROLLBACK',rowCount:null}));expect(c.binding()).toBeUndefined();
  await original(c);expect(()=>c.arm('undo-equality-entry',10799999)).toThrow();expect(()=>c.arm('invalid' as typeof OWNED_DETECTION_SCENARIOS[number],10800000)).toThrow();
 });
 it('cancelled verifier microtasks cannot mutate a stopped/restarted scope',async()=>{const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-beforecommit-microtask',10800000);await bind(c);for(let i=0;i<4;i++)c.verified(owner,'owned-session');c.clear();await Promise.resolve();expect(c.now()).toBe(7200000);});
 it('unexpected commit does not manufacture a fault observation',async()=>{const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-final-fence',10800000);await expect(c.query('COMMIT',undefined,async()=>({command:'COMMIT',rowCount:null}))).rejects.toThrow();expect(c.observation().fired).toBe(false);});
 it('same owner/session wrong or malformed resource cannot consume an armed fault',async()=>{
  const cases:[string,readonly unknown[]|undefined,boolean][]=[
   [sql.detectionModeRead,undefined,false],[sql.detectionModeRead,['foreign-owner'],false],[sql.detectionModeRead,[owner,'extra'],false],
   [sql.detectionReceiptLock,[owner],false],[sql.detectionReceiptLock,[owner,'owned-candidate','owned-receipt',null,null],false],[sql.detectionReceiptLock,[owner,null,'other-receipt',null,null],false],[sql.detectionReceiptLock,[owner,null,'owned-receipt','confirm',null],false],[sql.detectionReceiptLock,[owner,null,'owned-receipt',null,'private'],false],
   [sql.detectionCandidateLock,[owner,'other-candidate'],false],[sql.detectionCandidateLock,[owner],false],[sql.detectionCandidateLock,[owner,'owned-candidate'],false],
   [sql.detectionFinalFence,[owner,'other-session',0,'just-me'],true],[sql.detectionFinalFence,[owner],true],
   [sql.detectionCompareUpdate,[owner,'other-candidate'],true],[sql.detectionReceiptConsume,[owner,'other-receipt','owned-candidate'],true],[sql.detectionReceiptConsume,[owner,'owned-receipt','other-candidate'],true],
   [sql.detectionReceiptInsert,[owner,'new','other-candidate','undo'],true],[sql.detectionReceiptInsert,[owner,'new','owned-candidate','confirm'],true],[sql.detectionReceiptInsert,[owner,'new','owned-candidate','undo',null,null,null,null,null,null,null,null,'other-receipt'],true],
   [sql.detectionFeedbackSupersede,[owner,'other-candidate','new','owned-receipt'],true],[sql.detectionFeedbackSupersede,[owner,'owned-candidate','new','other-receipt'],true],
   [sql.detectionScanReceiptRead,[owner,Buffer.alloc(32)],false],
  ];
  for(const [statement,values,bound] of cases){const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-final-fence',10800000);if(bound)await bind(c);let dispatched=false;await expect(c.query(statement,values,async()=>{dispatched=true;return {command:'SELECT',rowCount:1};})).rejects.toThrow();expect(dispatched).toBe(false);expect(c.now()).toBe(7200000);expect(c.observation().fired).toBe(false);}
 });
 it('wrong replay key/target slots and premature final operations fail closed',async()=>{
  for(const values of [[owner,'other-candidate',null,'undo',Buffer.alloc(32)],[owner,'owned-candidate','other-receipt','undo',Buffer.alloc(32)],[owner,'owned-candidate',null,'confirm',Buffer.alloc(32)],[owner,'owned-candidate',null,'undo','private'],[owner,'owned-candidate',null,'undo',Buffer.alloc(31)]]){
   const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-final-fence',10800000);await c.query(sql.detectionReceiptLock,[owner,null,'owned-receipt',null,null],result);await expect(c.query(sql.detectionReceiptLock,values,result)).rejects.toThrow();expect(c.observation().fired).toBe(false);
  }
  for(const [statement,values] of [[sql.detectionFinalFence,[owner,'owned-session',0,'just-me']],[sql.detectionCompareUpdate,[owner,'owned-candidate']],[sql.detectionReceiptConsume,[owner,'owned-receipt','owned-candidate']],[sql.detectionReceiptInsert,[owner,'new','owned-candidate','undo',null,null,null,null,null,null,null,null,'owned-receipt']],[sql.detectionFeedbackSupersede,[owner,'owned-candidate','new','owned-receipt']]] as const){const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-final-fence',10800000);await expect(c.query(statement,values,result)).rejects.toThrow();}
 });
 it('repeated named boundary rejects rather than attributing two activations',async()=>{const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-final-fence',10800000);await bind(c);const values=[owner,'owned-session',7200000,'just-me'];await c.query(sql.detectionFinalFence,values,result);expect(c.observation().boundaries.detectionFinalFence).toBe(1);await expect(c.query(sql.detectionFinalFence,values,result)).rejects.toThrow();expect(c.observation().boundaries.detectionFinalFence).toBe(2);expect(c.observation().fired).toBe(false);});
 it('valid exact mutation targets are counted once without result replacement',async()=>{const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-final-fence',10800000);await c.query(sql.detectionModeRead,[owner],result);await bind(c);
  for(const [statement,values] of [[sql.detectionCompareUpdate,[owner,'owned-candidate']],[sql.detectionReceiptConsume,[owner,'owned-receipt','owned-candidate']],[sql.detectionReceiptInsert,[owner,'new','owned-candidate','undo',null,null,null,null,null,null,null,null,'owned-receipt']],[sql.detectionFeedbackSupersede,[owner,'owned-candidate','new','owned-receipt']],[sql.detectionReceiptLock,[owner,'owned-candidate',null,'undo',Buffer.alloc(32)]]] as const){const observed={command:'UPDATE',rowCount:1};expect(await c.query(statement,values,async()=>observed)).toBe(observed);}
  expect(c.observation().boundaries.detectionReceiptLock).toBe(3);
 });
 it('missing business targets and premature rollback cannot tick or inject transport faults',async()=>{
  const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-beforecommit-microtask',10800000);c.verified(owner,'owned-session');c.verified(owner,'owned-session');expect(()=>c.verified(owner,'owned-session')).toThrow();expect(c.observation().fired).toBe(false);
  for(const scenario of ['undo-expiry-rollback-before','undo-expiry-rollback-after'] as const){for(const bound of [false,true]){const scoped=new OwnedDetectionController();scoped.enable(10800000);await original(scoped);scoped.arm(scenario,10800000);if(bound)await bind(scoped);let dispatched=false;await expect(scoped.query('ROLLBACK',undefined,async()=>{dispatched=true;return {command:'ROLLBACK',rowCount:null};})).rejects.toThrow();expect(dispatched).toBe(false);expect(scoped.observation().fired).toBe(false);}}
 });
 it('candidate binding requires an actual singular SELECT outcome',async()=>{
  for(const observed of [{command:'UPDATE',rowCount:1},{command:'SELECT',rowCount:0}]){const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-equality-entry',10800000);await c.query(sql.detectionReceiptLock,[owner,null,'owned-receipt',null,null],result);await c.query(sql.detectionReceiptLock,[owner,'owned-candidate',null,'undo',Buffer.alloc(32)],result);await expect(c.query(sql.detectionCandidateLock,[owner,'owned-candidate'],async()=>observed)).rejects.toThrow();expect(c.now()).toBe(7200000);expect(c.observation().fired).toBe(false);}
 });
 it('counts after-work epoch once and rejects premature or repeated occurrence',async()=>{
  const fs=await import('node:fs/promises'),path=await import('node:path');const source=await fs.readFile(path.resolve(__dirname,'../src/auth/mobile-private/durable-mobile-authority.ts'),'utf8');const epoch=source.match(/client\.query\('(UPDATE st244_mobile\.epoch[^']+)'/)![1]!;
  for(const bound of [false,true]){const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-final-fence',10800000);if(bound)await bind(c);await c.query(epoch,undefined,result);
   if(bound){await c.query(epoch,undefined,result);expect(c.observation().boundaries.authorityEpochAfterWork).toBe(1);await expect(c.query(epoch,undefined,result)).rejects.toThrow();}else await expect(c.query(epoch,undefined,result)).rejects.toThrow();expect(c.observation().fired).toBe(false);
  }
 });
 it('unrequested commit transport remains unchanged even when correct resources have been observed',async()=>{const c=new OwnedDetectionController();c.enable(10800000);await original(c);c.arm('undo-expiry-after-final-fence',10800000);await bind(c);const unchanged={command:'COMMIT',rowCount:null};expect(await c.query('COMMIT',undefined,async()=>unchanged)).toBe(unchanged);expect(c.observation().boundaries.commitDispatch).toBe(1);expect(c.observation().fired).toBe(false);});
});
