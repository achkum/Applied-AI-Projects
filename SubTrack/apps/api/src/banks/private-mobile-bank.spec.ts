import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {createPrivateMobileBank,DurableSyntheticIngestionStore} from './private-mobile-bank.js';
import type {DurablePrivateMobileAuthority} from '../auth/mobile-private/durable-mobile-authority.js';
import type {OwnerTx} from '../auth/sessions-v2/durable-current-web-authority.js';
const OWNER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',CONNECTION='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',KEY='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const row={identity_id:OWNER,connection_id:CONNECTION,fixture_version:'solberg-v1',status:'ACTIVE',purged_at:null,account_count:1,transaction_count:0,last_synced_at:null};
function fixture(replies:Record<string,Record<string,unknown>[]>={}){
 const execute=vi.fn(async(name:string)=>{const rows=replies[name]??(name==='modeRead'?[{profile_complete:true,onboarding_mode:'just-me'}]:name==='bankRead'?[row]:[]);return {command:'SELECT',rowCount:rows.length,rows};});
 const authority={withCurrentMobileAuthority:vi.fn(async(_token:string,work:(tx:OwnerTx,owner:{identityId:string})=>Promise<unknown>)=>work({execute} as unknown as OwnerTx,{identityId:OWNER})),now:()=>Date.now()} as unknown as DurablePrivateMobileAuthority;
 return {bank:createPrivateMobileBank(authority),authority,execute};
}
describe('owner Synthetic banking policy',()=>{
 it('current authority controls owner and denies incomplete or non-personal profile before banking access',async()=>{
  for(const mode of [{profile_complete:false,onboarding_mode:'just-me'},{profile_complete:true,onboarding_mode:null}]){
   const f=fixture({modeRead:[mode]});expect(await f.bank.execute('access','read',{})).toEqual({status:409,code:'MODE_CONFLICT'});
   expect(f.execute.mock.calls.map(call=>call[0])).toEqual(['modeRead']);
  }
 });
 it('rejects forged owners, personas, ranges, unsafe request keys and read keys before authority',async()=>{
  const f=fixture();
  for(const [operation,body,key] of [['read',{owner:OWNER},undefined],['read',{},KEY],['connect',{institutionId:'real-bank'},KEY],['connect',{institutionId:'synthetic-demo-v1',persona:'solberg'},KEY],['sync',{connectionId:CONNECTION,range:'all'},KEY],['disconnect',{connectionId:CONNECTION,purge:'true'},KEY],['connect',{institutionId:'synthetic-demo-v1'},'bad']] as const){
   await expect(f.bank.execute('access',operation,body,key)).rejects.toThrow('wire');
  }
  expect(f.authority.withCurrentMobileAuthority).not.toHaveBeenCalled();
 });
 it('returns only bounded summary metadata without accounts, raw transactions or fixtures',async()=>{
  const f=fixture();const result=await f.bank.execute('access','read',{});expect(result.status).toBe(200);
  expect(JSON.stringify(result)).not.toMatch(/iban|description|solberg|rawPayload|accessToken/i);
  expect(f.execute).toHaveBeenCalledWith('bankRead',[OWNER,'SYNTHETIC','synthetic-demo-v1']);
 });
 it('never returns foreign fixture rows or reads nonexistent/foreign connection for a mutation',async()=>{
  await expect(fixture({bankRead:[{...row,identity_id:'foreign'}]}).bank.execute('access','read',{})).rejects.toThrow('Bank workflow unavailable');
  const f=fixture();expect(await f.bank.execute('access','sync',{connectionId:CONNECTION},KEY)).toEqual({status:409,code:'BANK_STATE_CONFLICT'});
 });
 it('immutable receipt replay does not resurrect a purged generation, and altered-body replay conflicts',async()=>{
  const body={connectionId:CONNECTION,purge:true};const request_h=createHash('sha256').update(JSON.stringify({version:'solberg-v1',operation:'disconnect',body})).digest();
  const receipt={request_h,operation:'disconnect',connection_id:CONNECTION,status:'REVOKED',disposition:'purged',account_count:0,transaction_count:0,last_sync_at:null};
  const f=fixture({bankReceiptRead:[receipt]});const replay=await f.bank.execute('access','disconnect',body,KEY);
  expect(replay).toMatchObject({status:200,value:{operation:'disconnect',connection:{disposition:'purged',accountCount:0,transactionCount:0}}});
  expect(f.execute.mock.calls.map(call=>call[0])).toEqual(['modeRead','bankReceiptRead']);
  expect(await f.bank.execute('access','disconnect',{...body,purge:false},KEY)).toEqual({status:409,code:'BANK_IDEMPOTENCY_CONFLICT'});
 });
 it('revoked or purged generations cannot sync',async()=>{
  for(const bank of [{...row,status:'REVOKED'},{...row,status:'REVOKED',purged_at:new Date(),account_count:0,transaction_count:0}]){
   const f=fixture({bankLock:[bank]});expect(await f.bank.execute('access','sync',{connectionId:CONNECTION},KEY)).toEqual({status:409,code:'BANK_STATE_CONFLICT'});
  }
 });
 it('named store rejects foreign accounts and unsafe fixture amounts without persistence',async()=>{
  const f=fixture();const account={id:CONNECTION,externalId:'demo',bankName:'Demo',accountType:'CHECKING' as const,currency:'SEK',ownerUserId:OWNER};
  const store=new DurableSyntheticIngestionStore({execute:f.execute} as unknown as OwnerTx,OWNER,account);
  await expect(store.getRecords(OWNER)).rejects.toThrow();
  const record={dedupKey:CONNECTION+':charge',accountId:CONNECTION,externalId:'charge',date:new Date(),description:'DEMO',amountMinor:Number.MAX_SAFE_INTEGER+1,currency:'SEK',direction:'DEBIT',pending:false,rawPayload:'must-not-persist'};
  await expect(store.upsertRecords([record])).rejects.toThrow();expect(f.execute).not.toHaveBeenCalled();
 });
});
function bankingState(){
 const connections=new Map<string,Record<string,unknown>>(),accounts=new Map<string,Record<string,unknown>>(),transactions=new Map<string,Record<string,unknown>>(),receipts=new Map<string,Record<string,unknown>>();
 const execute=vi.fn(async(name:string,values:readonly unknown[])=>{
  const connection=connections.get(String(values[1]));let command='SELECT';let rows:Record<string,unknown>[]=[];
  const view=(item:Record<string,unknown>)=>({...item,account_count:[...accounts.values()].filter(a=>a.connectionId===item.connection_id).length,transaction_count:[...transactions.values()].filter(t=>accounts.get(String(t.accountId))?.connectionId===item.connection_id).length});
  if(name==='modeRead')rows=[{profile_complete:true,onboarding_mode:'just-me'}];
  else if(name==='bankRead')rows=[...connections.values()].filter(item=>item.purged_at===null).map(view);
  else if(name==='bankActive')rows=[...connections.values()].filter(item=>item.status==='ACTIVE'&&item.purged_at===null).map(item=>({connection_id:item.connection_id}));
  else if(name==='bankLock')rows=connection?[view(connection)]:[];
  else if(name==='bankReceiptRead')rows=receipts.has(String(values[1]))?[receipts.get(String(values[1]))!]:[];
  else if(name==='bankConnect'){
   command='INSERT';connections.set(String(values[1]),{...row,connection_id:values[1]});rows=[{id:values[1]}];
  }else if(name==='bankGeneration'){command='INSERT';rows=[{id:values[1]}];}
  else if(name==='bankAccountInsert'){
   command='INSERT';accounts.set(String(values[2]),{id:values[2],connectionId:values[1],provider_account_id:values[3],name:values[4],type:values[5],currency:values[6]});rows=[{id:values[2]}];
  }else if(name==='bankAccounts')rows=[...accounts.values()].filter(a=>a.connectionId===values[1]);
  else if(name==='bankTransactions')rows=[...transactions.values()].filter(t=>t.accountId===values[1]);
  else if(name==='bankTransactionUpsert'){
   command='INSERT';const id=String(values[1])+':'+String(values[2]);transactions.set(id,{id,accountId:values[1],provider_transaction_id:values[2],amount_minor:values[3],currency:values[4],transaction_date:values[5],status:values[6],raw_description:values[7]});rows=[{id}];
  }else if(name==='bankSynced'){command='UPDATE';connection!.last_synced_at=new Date(String(values[2]));rows=[{id:values[1]}];}
  else if(name==='bankRevoke'){command='UPDATE';connection!.status='REVOKED';rows=[{id:values[1]}];}
  else if(name==='bankPurgeTransactions'){
   command='DELETE';for(const [id,item]of transactions)if(accounts.get(String(item.accountId))?.connectionId===values[1]){rows.push({id});transactions.delete(id);}
  }else if(name==='bankPurgeAccounts'){
   command='DELETE';for(const [id,item]of accounts)if(item.connectionId===values[1]){rows.push({id});accounts.delete(id);}
  }else if(name==='bankPurged'){command='UPDATE';connection!.purged_at=new Date();rows=[{id:values[1]}];}
  else if(name==='bankReceiptInsert'){
   command='INSERT';receipts.set(String(values[1]),{request_h:values[2],operation:values[3],connection_id:values[4],status:values[5],disposition:values[6],account_count:values[7],transaction_count:values[8],last_sync_at:values[9]===null?null:new Date(String(values[9]))});rows=[{id:values[4]}];
  }else throw new Error('Unknown named unit store operation');
  return {command,rows,rowCount:rows.length};
 });
 const authority={withCurrentMobileAuthority:async(_token:string,work:(tx:OwnerTx,owner:{identityId:string})=>Promise<unknown>)=>work({execute} as unknown as OwnerTx,{identityId:OWNER}),now:()=>Date.parse('2026-10-14T00:00:00.000Z')} as unknown as DurablePrivateMobileAuthority;
 return {bank:createPrivateMobileBank(authority),execute,connections,accounts,transactions,receipts};
}
describe('Synthetic owner workflow public behavior',()=>{
 it('connects once, syncs real deterministic provider data without duplicates, retains on disconnect, then purges without reactivating replay',async()=>{
  const f=bankingState();const body={institutionId:'synthetic-demo-v1'};
  const connected=await f.bank.execute('access','connect',body,KEY);expect(connected).toMatchObject({status:200,value:{connection:{status:'ACTIVE',accountCount:1,transactionCount:0}}});
  const connectionId=[...f.connections.keys()][0]!;
  expect(await f.bank.execute('access','connect',body,KEY)).toEqual(connected);
  expect(await f.bank.execute('access','connect',body,'dddddddd-dddd-4ddd-8ddd-dddddddddddd')).toMatchObject({status:200});expect(f.connections.size).toBe(1);
  const syncBody={connectionId};const synced=await f.bank.execute('access','sync',syncBody,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');expect(synced).toMatchObject({status:200,value:{connection:{status:'ACTIVE',accountCount:1,lastSyncAt:'2026-10-14T00:00:00.000Z'}}});
  const count=f.transactions.size;expect(count).toBeGreaterThan(0);
  expect([...f.transactions.values()].every(item=>typeof item.amount_minor==='string'&&!String(item.provider_transaction_id).includes('solberg'))).toBe(true);
  expect(await f.bank.execute('access','sync',syncBody,'ffffffff-ffff-4fff-8fff-ffffffffffff')).toEqual(synced);expect(f.transactions.size).toBe(count);
  expect(await f.bank.execute('access','disconnect',{connectionId,purge:false},'11111111-1111-4111-8111-111111111111')).toMatchObject({status:200,value:{connection:{status:'REVOKED',disposition:'retained',transactionCount:count}}});
  expect(f.transactions.size).toBe(count);
  const purged=await f.bank.execute('access','disconnect',{connectionId,purge:true},'22222222-2222-4222-8222-222222222222');expect(purged).toMatchObject({status:200,value:{connection:{status:'REVOKED',disposition:'purged',accountCount:0,transactionCount:0}}});
  expect(await f.bank.execute('access','read',{})).toEqual({status:200,value:{connections:[]}});
  expect(await f.bank.execute('access','connect',body,KEY)).toEqual(connected);expect(f.accounts.size).toBe(0);
  expect(await f.bank.execute('access','disconnect',{connectionId,purge:true},'33333333-3333-4333-8333-333333333333')).toEqual(purged);
  expect(await f.bank.execute('access','connect',body,'44444444-4444-4444-8444-444444444444')).toMatchObject({status:200});expect(f.connections.size).toBe(2);
 });
 it('enforces retained generation capacity and does not hide overflow from a read',async()=>{
  const f=bankingState();for(let i=0;i<50;i++)f.connections.set(String(i),{...row,connection_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,status:'REVOKED'});
  expect(await f.bank.execute('access','connect',{institutionId:'synthetic-demo-v1'},KEY)).toEqual({status:409,code:'BANK_STATE_CONFLICT'});
  f.connections.set('overflow',{...row,status:'REVOKED'});await expect(f.bank.execute('access','read',{})).rejects.toThrow();
 });
});

describe('bank durable result corruption containment',()=>{
 it('withholds corrupt fixture bindings, timestamps and immutable receipt hashes',async()=>{
  for(const changed of [{identity_id:'foreign'},{fixture_version:'unreviewed'},{last_synced_at:0},{last_synced_at:new Date(NaN)}]){
   await expect(fixture({bankRead:[{...row,...changed}]}).bank.execute('access','read',{})).rejects.toThrow();
  }
  for(const request_h of [undefined,'raw',Buffer.alloc(31)])await expect(fixture({bankReceiptRead:[{request_h}]}).bank.execute('access','connect',{institutionId:'synthetic-demo-v1'},KEY)).rejects.toThrow();
  const body={institutionId:'synthetic-demo-v1'},request_h=createHash('sha256').update(JSON.stringify({version:'solberg-v1',operation:'connect',body})).digest();
  expect(await fixture({bankReceiptRead:[{request_h,operation:'sync'}]}).bank.execute('access','connect',body,KEY)).toEqual({status:409,code:'BANK_IDEMPOTENCY_CONFLICT'});
 });
 it('rejects unexpected database command/row framing rather than fabricating acknowledgement',async()=>{
  for(const reply of [{command:'INSERT',rows:[],rowCount:0},{command:'SELECT',rows:[],rowCount:1},{command:'SELECT',rows:[row,row],rowCount:2}]){
   const f=fixture();f.execute.mockImplementation(async()=>reply as never);await expect(f.bank.execute('access','read',{})).rejects.toThrow();
  }
 });
 it('checks signed integer bridges and canonical banking fields before using persisted ingestion records',async()=>{
  const account={id:CONNECTION,externalId:'demo',bankName:'Demo',accountType:'CHECKING' as const,currency:'SEK',ownerUserId:OWNER};
  const valid={provider_transaction_id:'charge',transaction_date:'2026-10-01',raw_description:'DEMO',amount_minor:'-100',currency:'SEK',status:'BOOKED'};
  const f=fixture({bankTransactions:[valid]});const store=new DurableSyntheticIngestionStore({execute:f.execute} as unknown as OwnerTx,OWNER,account);
  expect([...(await store.getRecords(CONNECTION)).values()][0]).toMatchObject({amountMinor:-100,rawPayload:'',direction:'DEBIT'});
  for(const patch of [{amount_minor:null},{amount_minor:'1.5'},{amount_minor:'9007199254740992'},{amount_minor:'-9007199254740992'},{provider_transaction_id:0},{transaction_date:0},{raw_description:null},{currency:'USD'},{status:'PENDING'}]){
   const bad=fixture({bankTransactions:[{...valid,...patch}]});await expect(new DurableSyntheticIngestionStore({execute:bad.execute} as unknown as OwnerTx,OWNER,account).getRecords(CONNECTION)).rejects.toThrow();
  }
 });
 it('rejects mismatched account/dedup identity and invalid provider records before inserting',async()=>{
  const account={id:CONNECTION,externalId:'demo',bankName:'Demo',accountType:'CHECKING' as const,currency:'SEK',ownerUserId:OWNER};
  const record={dedupKey:CONNECTION+':charge',accountId:CONNECTION,externalId:'charge',date:new Date('2026-10-01'),description:'DEMO',amountMinor:-100,currency:'SEK',direction:'DEBIT',pending:false,rawPayload:'not stored'};
  for(const patch of [{accountId:OWNER},{dedupKey:'wrong'},{externalId:'x'.repeat(256),dedupKey:CONNECTION+':'+'x'.repeat(256)},{currency:'USD'},{pending:true},{direction:'CREDIT'},{description:'x'.repeat(501)},{date:new Date(NaN)},{amountMinor:NaN},{amountMinor:-0}]){
   const f=fixture();const store=new DurableSyntheticIngestionStore({execute:f.execute} as unknown as OwnerTx,OWNER,account);await expect(store.upsertRecords([{...record,...patch}])).rejects.toThrow();expect(f.execute).not.toHaveBeenCalled();
  }
  const f=fixture();f.execute.mockImplementation(async()=>({command:'INSERT',rowCount:1,rows:[{}]}) as never);
  await expect(new DurableSyntheticIngestionStore({execute:f.execute} as unknown as OwnerTx,OWNER,account).upsertRecords([record])).rejects.toThrow();
 });
});

describe('named bank mutation/store invariant failures',()=>{
 async function connected(){
  const state=bankingState();await state.bank.execute('access','connect',{institutionId:'synthetic-demo-v1'},KEY);
  return {...state,connectionId:[...state.connections.keys()][0]!};
 }
 it('withholds acknowledgements when named writes do not return the expected owned identifier',async()=>{
  const f=bankingState(),original=f.execute.getMockImplementation()!;
  f.execute.mockImplementation(async(name,values)=>name==='bankConnect'?{command:'INSERT',rows:[{id:'wrong'}],rowCount:1}:original(name,values));
  await expect(f.bank.execute('access','connect',{institutionId:'synthetic-demo-v1'},KEY)).rejects.toThrow();
 });
 it('rejects corrupt active generation identifiers and mismatched persisted provider account binding',async()=>{
  const f=fixture({bankActive:[{connection_id:0}]});await expect(f.bank.execute('access','connect',{institutionId:'synthetic-demo-v1'},KEY)).rejects.toThrow();
  for(const corrupted of [[],[{id:CONNECTION,provider_account_id:'wrong'}],[{id:0,provider_account_id:'wrong'}]]){
   const state=await connected(),original=state.execute.getMockImplementation()!;
   state.execute.mockImplementation(async(name,values)=>name==='bankAccounts'?{command:'SELECT',rows:corrupted,rowCount:corrupted.length}:original(name,values));
   await expect(state.bank.execute('access','sync',{connectionId:state.connectionId},'55555555-5555-4555-8555-555555555555')).rejects.toThrow();
  }
 });
 it('rejects malformed purge return IDs and verifies actual post-purge counts before tombstoning',async()=>{
  for(const failure of ['returned-id','remaining-account','missing-post-purge'] as const){
   const state=await connected(),original=state.execute.getMockImplementation()!;let locks=0;
   state.execute.mockImplementation(async(name,values)=>{
    if(name==='bankPurgeTransactions'&&failure==='returned-id')return {command:'DELETE',rowCount:1,rows:[{id:0}]};
    if(name==='bankPurgeAccounts'&&failure==='remaining-account')return {command:'DELETE',rowCount:0,rows:[]};
    if(name==='bankLock'&&++locks===2&&failure==='missing-post-purge')return {command:'SELECT',rowCount:0,rows:[]};
    return original(name,values);
   });
   await expect(state.bank.execute('access','disconnect',{connectionId:state.connectionId,purge:true},'66666666-6666-4666-8666-666666666666')).rejects.toThrow();
   expect([...state.connections.values()][0]!.purged_at).toBeNull();
  }
 });
 it('withholds the receipt if the final locked generation disappears after a mutation',async()=>{
  const state=await connected(),original=state.execute.getMockImplementation()!;let locks=0;
  state.execute.mockImplementation(async(name,values)=>name==='bankLock'&&++locks===2?{command:'SELECT',rowCount:0,rows:[]}:original(name,values));
  await expect(state.bank.execute('access','disconnect',{connectionId:state.connectionId,purge:false},'77777777-7777-4777-8777-777777777777')).rejects.toThrow();
 });
});

describe('trusted provider/worker interface failure containment',()=>{
 it('fails closed if the server-bound provider loses its expected account',async()=>{
  const runtime=createRequire(__filename);
  const provider=await import(pathToFileURL(runtime.resolve('@subtrack/synthetic/bank-runtime')).href) as typeof import('@subtrack/synthetic/bank-runtime');
  const state=bankingState();const missing=vi.spyOn(provider.SyntheticBankProvider.prototype,'getAccounts').mockResolvedValueOnce([]);
  try{await expect(state.bank.execute('access','connect',{institutionId:'synthetic-demo-v1'},KEY)).rejects.toThrow();}finally{missing.mockRestore();}
  const connected=bankingState();await connected.bank.execute('access','connect',{institutionId:'synthetic-demo-v1'},KEY);
  const id=[...connected.connections.keys()][0]!;const lost=vi.spyOn(provider.SyntheticBankProvider.prototype,'getAccounts').mockResolvedValueOnce([]);
  try{await expect(connected.bank.execute('access','sync',{connectionId:id},'88888888-8888-4888-8888-888888888888')).rejects.toThrow();}finally{lost.mockRestore();}
 });
 it('the owner-bound transaction adapter denies a worker requesting an unrelated account',async()=>{
  const runtime=createRequire(__filename);
  const worker=await import(pathToFileURL(runtime.resolve('@subtrack/domain/ingestion-runtime')).href) as typeof import('@subtrack/domain/ingestion-runtime');
  const state=bankingState();await state.bank.execute('access','connect',{institutionId:'synthetic-demo-v1'},KEY);const id=[...state.connections.keys()][0]!;
  // Dependency fault injection: verify confinement even if the trusted worker supplies an alien account.
  const badWorker=vi.spyOn(worker.IngestionWorker.prototype,'syncUser').mockImplementationOnce(async function(this:import('@subtrack/domain/ingestion-runtime').IngestionWorker,_user,options){
   const internal=this as unknown as {provider:import('@subtrack/domain/bank').BankDataProvider};
   await internal.provider.getTransactions('unrelated-account',options.from,options.until);return [];
  });
  try{await expect(state.bank.execute('access','sync',{connectionId:id},'99999999-9999-4999-8999-999999999999')).rejects.toThrow();expect(state.transactions.size).toBe(0);}finally{badWorker.mockRestore();}
 });
});
