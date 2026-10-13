import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import type {OwnerTx} from '../auth/sessions-v2/durable-current-web-authority.js';
import type {DurablePrivateMobileAuthority} from '../auth/mobile-private/durable-mobile-authority.js';
import type {IngestionRecord} from '@subtrack/domain/ingestion';
import type {BankAccount} from '@subtrack/domain/bank';
import type {PrivateMobileBankOperation,PrivateMobileBankSummary} from '@subtrack/contracts/private-mobile-bank';
const runtime=createRequire(__filename);
const wire=runtime('@subtrack/contracts/private-mobile-bank') as typeof import('@subtrack/contracts/private-mobile-bank');
const PROVIDER='SYNTHETIC',INSTITUTION='synthetic-demo-v1',VERSION='solberg-v1';
type Row=Record<string,unknown>;
type Result=Readonly<{status:200;value:object}|{status:409;code:'MODE_CONFLICT'|'BANK_STATE_CONFLICT'|'BANK_IDEMPOTENCY_CONFLICT'}>;
function unavailable():never{throw new Error('Bank workflow unavailable');}
async function rows(tx:OwnerTx,name:string,values:readonly unknown[],command='SELECT'):Promise<Row[]>{
 const result=await tx.execute(name,values);
 if(result.command!==command||result.rowCount!==result.rows.length)return unavailable();
 return result.rows;
}
async function single(tx:OwnerTx,name:string,values:readonly unknown[],command='SELECT'):Promise<Row|undefined>{
 const result=await rows(tx,name,values,command);if(result.length>1)return unavailable();return result[0];
}
async function changed(tx:OwnerTx,name:string,values:readonly unknown[],command:string,id:string):Promise<void>{
 if((await single(tx,name,values,command))?.id!==id)return unavailable();
}
function timestamp(value:unknown):string|null{
 if(value===null)return null;if(!(value instanceof Date)||!Number.isFinite(value.getTime()))return unavailable();return value.toISOString();
}
function summary(row:Row,identity:string):PrivateMobileBankSummary{
 if(row.identity_id!==identity||row.fixture_version!==VERSION)return unavailable();
 return wire.parsePrivateMobileBankSummary({connectionId:row.connection_id,provider:PROVIDER,institutionId:INSTITUTION,status:row.status,
 disposition:row.purged_at===null?'retained':'purged',accountCount:row.account_count,transactionCount:row.transaction_count,lastSyncAt:timestamp(row.last_synced_at)});
}
function receiptSummary(row:Row):PrivateMobileBankSummary{
 return wire.parsePrivateMobileBankSummary({connectionId:row.connection_id,provider:PROVIDER,institutionId:INSTITUTION,status:row.status,
 disposition:row.disposition,accountCount:row.account_count,transactionCount:row.transaction_count,lastSyncAt:timestamp(row.last_sync_at)});
}
function minor(value:number):string{
 if(!Number.isSafeInteger(value)||Object.is(value,-0))return unavailable();return BigInt(value).toString();
}
/** Named owner store: no arbitrary SQL, raw provider payload, token, or fixture-persona persistence. */
export class DurableSyntheticIngestionStore{
 constructor(private readonly tx:OwnerTx,private readonly owner:string,private readonly account:BankAccount){}
 async getRecords(accountId:string):Promise<Map<string,IngestionRecord>>{
  if(accountId!==this.account.id)return unavailable();const result=new Map<string,IngestionRecord>();
  for(const row of await rows(this.tx,'bankTransactions',[this.owner,accountId])){
   if(typeof row.amount_minor!=='string'||! /^-?[0-9]+$/.test(row.amount_minor))return unavailable();
   const amount=BigInt(row.amount_minor);if(amount>BigInt(Number.MAX_SAFE_INTEGER)||amount<BigInt(Number.MIN_SAFE_INTEGER))return unavailable();
   if(typeof row.provider_transaction_id!=='string'||typeof row.transaction_date!=='string'||typeof row.raw_description!=='string'||row.currency!=='SEK'||row.status!=='BOOKED')return unavailable();
   const key=`${accountId}:${row.provider_transaction_id}`;
   // Checked representation bridge into the legacy IngestionRecord number field; no Money arithmetic.
   result.set(key,{dedupKey:key,accountId,externalId:row.provider_transaction_id,date:new Date(`${row.transaction_date}T00:00:00.000Z`),description:row.raw_description,amountMinor:Number(amount),currency:'SEK',direction:'DEBIT',pending:false,rawPayload:''});
  }
  return result;
 }
 async upsertRecords(records:IngestionRecord[]):Promise<void>{
  for(const record of records){
   if(record.accountId!==this.account.id||record.dedupKey!==`${record.accountId}:${record.externalId}`||record.externalId.length>255||record.currency!=='SEK'||record.pending||record.direction!=='DEBIT'||record.description.length>500||!Number.isFinite(record.date.getTime()))return unavailable();
   const amount=minor(record.amountMinor);const date=record.date.toISOString().slice(0,10);
   const digest=createHash('sha256').update(JSON.stringify([record.externalId,date,amount,record.currency,record.description])).digest('hex');
   const saved=await single(this.tx,'bankTransactionUpsert',[this.owner,record.accountId,record.externalId,amount,'SEK',date,'BOOKED',record.description,false,digest],'INSERT');
   if(typeof saved?.id!=='string')return unavailable();
  }
 }
}
async function sync(tx:OwnerTx,owner:string,connectionId:string,now:number):Promise<void>{
 const [{SyntheticBankProvider},{PERSONA_SOLBERG},{IngestionWorker}]=await Promise.all([
  loadBank(),loadPersona(),loadIngestion(),
 ]);
 // Client has no persona/owner selector. Copy server fixture metadata and bind its stream only to this current authority.
 const persona=boundPersona(PERSONA_SOLBERG,owner,connectionId);
 const provider=new SyntheticBankProvider([persona]);const fixtures=await provider.getAccounts(owner);
 const accounts=await rows(tx,'bankAccounts',[owner,connectionId]);if(fixtures.length!==1||accounts.length!==1)return unavailable();
 const fixture=fixtures[0]!,stored=accounts[0]!;
 if(stored.provider_account_id!==fixture.externalId||typeof stored.id!=='string')return unavailable();
 const account:BankAccount={...fixture,id:stored.id};
 const bound={getAccounts:async()=>[account],getTransactions:async(id:string,from:Date,to:Date)=>{
  if(id!==account.id)return unavailable();return (await provider.getTransactions(fixture.id,from,to)).map(item=>({...item,accountId:account.id}));
 }};
 const until=new Date(now),from=new Date(Date.UTC(until.getUTCFullYear(),until.getUTCMonth()-24,until.getUTCDate()));
 await new IngestionWorker(bound,new DurableSyntheticIngestionStore(tx,owner,account)).syncUser(owner,{from,until});
 await changed(tx,'bankSynced',[owner,connectionId,until.toISOString(),'ACTIVE'],'UPDATE',connectionId);
}
export function createPrivateMobileBank(authority:DurablePrivateMobileAuthority){
 return Object.freeze({async execute(accessToken:string,operation:PrivateMobileBankOperation,body:unknown,key?:string):Promise<Result>{
  let parsed:Readonly<{connectionId?:string;purge?:boolean;institutionId?:string}>;
  try{
   wire.parsePrivateMobileBankRequestKey(operation,key);
   parsed=operation==='read'?wire.parsePrivateMobileBankRead(body):operation==='connect'?wire.parsePrivateMobileBankConnect(body):operation==='sync'?wire.parsePrivateMobileBankSync(body):wire.parsePrivateMobileBankDisconnect(body);
  }catch{throw new Error('wire');}
  return authority.withCurrentMobileAuthority(accessToken,async(tx,owner)=>{
   const identity=owner.identityId,mode=await single(tx,'modeRead',[identity]);
   if(mode?.profile_complete!==true||mode.onboarding_mode!=='just-me')return {status:409,code:'MODE_CONFLICT'};
   if(operation==='read'){
    const found=await rows(tx,'bankRead',[identity,PROVIDER,INSTITUTION]);if(found.length>50)return unavailable();return {status:200,value:wire.parsePrivateMobileBankReadResult({connections:found.map(row=>summary(row,identity))})};
   }
   const keyHash=createHash('sha256').update(key!).digest(),hash=createHash('sha256').update(JSON.stringify({version:VERSION,operation,body:parsed})).digest();
   const receipt=await single(tx,'bankReceiptRead',[identity,keyHash]);
   if(receipt){
    if(!Buffer.isBuffer(receipt.request_h)||receipt.request_h.length!==32)return unavailable();
    if(!timingSafeEqual(receipt.request_h,hash)||receipt.operation!==operation)return {status:409,code:'BANK_IDEMPOTENCY_CONFLICT'};
    return {status:200,value:wire.parsePrivateMobileBankMutationResult({operation,connection:receiptSummary(receipt)})};
   }
   // The strict non-connect request parsers require a canonical connection UUID.
   let connectionId=parsed.connectionId!;
   if(operation==='connect'){
    const existing=await single(tx,'bankActive',[identity,PROVIDER,INSTITUTION,'ACTIVE']);
    if(existing){if(typeof existing.connection_id!=='string')return unavailable();connectionId=existing.connection_id;}
    else{
     if((await rows(tx,'bankRead',[identity,PROVIDER,INSTITUTION])).length>=50)return {status:409,code:'BANK_STATE_CONFLICT'};
     connectionId=randomUUID();await changed(tx,'bankConnect',[identity,connectionId,PROVIDER,INSTITUTION,'Synthetic Demo Bank','ACTIVE'],'INSERT',connectionId);
     await changed(tx,'bankGeneration',[identity,connectionId,VERSION],'INSERT',connectionId);
     const {PERSONA_SOLBERG}=await loadPersona(),{SyntheticBankProvider}=await loadBank();
     const fixture=(await new SyntheticBankProvider([boundPersona(PERSONA_SOLBERG,identity,connectionId)]).getAccounts(identity))[0];if(!fixture)return unavailable();
     const id=randomUUID();await changed(tx,'bankAccountInsert',[identity,connectionId,id,fixture.externalId,'Synthetic account','CHECKING','SEK'],'INSERT',id);
    }
   }
   let row=await single(tx,'bankLock',[identity,connectionId,PROVIDER,INSTITUTION]);if(!row)return {status:409,code:'BANK_STATE_CONFLICT'};
   let current=summary(row,identity);
   if(operation==='sync'){
    if(current.status!=='ACTIVE'||current.disposition!=='retained')return {status:409,code:'BANK_STATE_CONFLICT'};
    await sync(tx,identity,connectionId,authority.now());
   }else if(operation==='disconnect'){
    await changed(tx,'bankRevoke',[identity,connectionId,'REVOKED'],'UPDATE',connectionId);
    if(parsed.purge&&current.disposition==='retained'){
     for(const name of ['bankPurgeTransactions','bankPurgeAccounts']){
      const deleted=await rows(tx,name,[identity,connectionId],'DELETE');if(deleted.some(item=>typeof item.id!=='string'))return unavailable();
     }
     row=await single(tx,'bankLock',[identity,connectionId,PROVIDER,INSTITUTION]);if(!row||row.account_count!==0||row.transaction_count!==0)return unavailable();
     await changed(tx,'bankPurged',[identity,connectionId],'UPDATE',connectionId);
    }
   }
   row=await single(tx,'bankLock',[identity,connectionId,PROVIDER,INSTITUTION]);if(!row)return unavailable();current=summary(row,identity);
   await changed(tx,'bankReceiptInsert',[identity,keyHash,hash,operation,connectionId,current.status,current.disposition,current.accountCount,current.transactionCount,current.lastSyncAt],'INSERT',connectionId);
   return {status:200,value:wire.parsePrivateMobileBankMutationResult({operation,connection:current})};
  });
 }});
}

function loadBank():Promise<typeof import('@subtrack/synthetic/bank-runtime')>{return import(pathToFileURL(runtime.resolve('@subtrack/synthetic/bank-runtime')).href) as Promise<typeof import('@subtrack/synthetic/bank-runtime')>;}

function loadPersona():Promise<typeof import('@subtrack/synthetic/personas-runtime')>{return import(pathToFileURL(runtime.resolve('@subtrack/synthetic/personas-runtime')).href) as Promise<typeof import('@subtrack/synthetic/personas-runtime')>;}

function loadIngestion():Promise<typeof import('@subtrack/domain/ingestion-runtime')>{return import(pathToFileURL(runtime.resolve('@subtrack/domain/ingestion-runtime')).href) as Promise<typeof import('@subtrack/domain/ingestion-runtime')>;}

function boundPersona(fixture:import('@subtrack/synthetic/personas-runtime').PersonaHousehold,owner:string,connectionId:string){
 const seed=createHash('sha256').update(JSON.stringify([VERSION,owner,connectionId])).digest('hex');
 return {...fixture,id:owner,displayName:'Synthetic fixture',seed,members:[],subscriptions:fixture.subscriptions.map((sub,index)=>({...sub,id:`fixture-${index}`,descriptorVariants:[...sub.descriptorVariants] as typeof sub.descriptorVariants}))};
}
