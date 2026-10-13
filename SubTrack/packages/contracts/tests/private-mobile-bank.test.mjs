import assert from 'node:assert/strict';
import test from 'node:test';
import * as p from '../private-mobile-bank.ts';

const id = '123e4567-e89b-42d3-a456-426614174000';
const active = {connectionId:id,provider:'SYNTHETIC',institutionId:'synthetic-demo-v1',status:'ACTIVE',disposition:'retained',accountCount:2,transactionCount:24,lastSyncAt:'2026-10-14T00:00:00.000Z'};
test('requests exclude owner, persona, range and raw banking selectors', () => {
 assert.deepEqual(p.parsePrivateMobileBankRead({}), {});
 assert.deepEqual(p.parsePrivateMobileBankConnect({institutionId:'synthetic-demo-v1'}), {institutionId:'synthetic-demo-v1'});
 assert.deepEqual(p.parsePrivateMobileBankSync({connectionId:id}), {connectionId:id});
 for (const purge of [true,false]) assert.deepEqual(p.parsePrivateMobileBankDisconnect({connectionId:id,purge}), {connectionId:id,purge});
 for (const [parse,body] of [[p.parsePrivateMobileBankRead,{}],[p.parsePrivateMobileBankConnect,{institutionId:'synthetic-demo-v1'}],[p.parsePrivateMobileBankSync,{connectionId:id}],[p.parsePrivateMobileBankDisconnect,{connectionId:id,purge:true}]]) {
  for (const value of [null,undefined,false,1,'x',[],Object.create(null),new Date()]) assert.throws(() => parse(value));
  for (const key of ['ownerId','persona','accountId','from','to','token']) assert.throws(() => parse({...body,[key]:'forged'}));
  assert.throws(() => parse({...body,[Symbol('hidden')]:'forged'}));
  const getter={...body};Object.defineProperty(getter,'injected',{get(){throw Error('getter must not execute');},enumerable:true});assert.throws(()=>parse(getter),/bank-shape/);
  if(Object.keys(body).length) {const getter={...body};Object.defineProperty(getter,Object.keys(body)[0],{get(){throw Error('getter must not execute');},enumerable:true});assert.throws(()=>parse(getter),/bank-shape/);}
 }
 for (const institutionId of ['tink',undefined,1]) assert.throws(()=>p.parsePrivateMobileBankConnect({institutionId}));
 for (const connectionId of ['bad',1,undefined,id.toUpperCase()]) assert.throws(()=>p.parsePrivateMobileBankSync({connectionId}));
 for (const purge of [undefined,null,1,'true']) assert.throws(()=>p.parsePrivateMobileBankDisconnect({connectionId:id,purge}));
 assert.throws(()=>p.parsePrivateMobileBankDisconnect({connectionId:'bad',purge:true}));
 assert.throws(()=>p.parsePrivateMobileBankConnect({}));
});
test('read forbids any key and every mutation requires exact UUIDv4', () => {
 assert.equal(p.parsePrivateMobileBankRequestKey('read',undefined),null);
 for (const key of [null,'',id,[],id+','+id]) assert.throws(()=>p.parsePrivateMobileBankRequestKey('read',key));
 for (const op of ['connect','sync','disconnect']) {
  assert.equal(p.parsePrivateMobileBankRequestKey(op,id),id);
  for (const key of [undefined,null,[],1,'',id.toUpperCase(),id.replace('-42d3','-72d3')]) assert.throws(()=>p.parsePrivateMobileBankRequestKey(op,key));
 }
 assert.throws(()=>p.parsePrivateMobileBankRequestKey('forged',id));
});
test('summary validates safe counts, canonical real UTC instant and purged invariants', () => {
 assert.deepEqual(p.parsePrivateMobileBankSummary(active),active);
 assert.equal(p.parsePrivateMobileBankSummary({...active,lastSyncAt:null}).lastSyncAt,null);
 assert.equal(p.parsePrivateMobileBankSummary({...active,status:'REVOKED'}).status,'REVOKED');
 const purged={...active,status:'REVOKED',disposition:'purged',accountCount:0,transactionCount:0};assert.deepEqual(p.parsePrivateMobileBankSummary(purged),purged);
 for(const patch of [{provider:'TINK'},{institutionId:'other'},{status:'PENDING'},{disposition:'unknown'},{connectionId:'bad'},{ownerId:id},{lastSyncAt:undefined}]) assert.throws(()=>p.parsePrivateMobileBankSummary({...active,...patch}));
 for(const field of ['accountCount','transactionCount']) {
  for(const value of [NaN,Infinity,-1,-0,0.1,Number.MAX_SAFE_INTEGER+1,1000001,'2',undefined]) assert.throws(()=>p.parsePrivateMobileBankSummary({...active,[field]:value}));
  for(const value of [0,1000000]) assert.equal(p.parsePrivateMobileBankSummary({...active,[field]:value})[field],value);
 }
 for(const lastSyncAt of [1,'bad','0000-01-01T00:00:00.000Z','2026-02-30T00:00:00.000Z','2026-13-01T00:00:00.000Z','2026-10-14T00:00:00Z','2026-10-14T00:00:00.000+00:00']) assert.throws(()=>p.parsePrivateMobileBankSummary({...active,lastSyncAt}));
 for(const patch of [{status:'ACTIVE'},{accountCount:1},{transactionCount:1}]) assert.throws(()=>p.parsePrivateMobileBankSummary({...purged,...patch}));
});
test('read and immutable mutation snapshots stay closed and operation-consistent', () => {
 assert.deepEqual(p.parsePrivateMobileBankReadResult({connections:[]}),{connections:[]});
 assert.deepEqual(p.parsePrivateMobileBankReadResult({connections:[active]}),{connections:[active]});
 const retained={...active,status:'REVOKED'};
 for(const connections of [null,{},[active,active],Array(51).fill(active),[{...active,disposition:'purged',status:'REVOKED',accountCount:0,transactionCount:0}],[active,{...active,connectionId:id.replace('4000','4001')}]]) assert.throws(()=>p.parsePrivateMobileBankReadResult({connections}));
 const accessor=[active];Object.defineProperty(accessor,'0',{get(){throw Error('getter must not execute');}});
 const inherited=Object.setPrototypeOf([active],null);
 const symbol=[active];symbol[Symbol('hidden')]=true;
 for(const connections of [Array(1),accessor,inherited,symbol]) assert.throws(()=>p.parsePrivateMobileBankReadResult({connections}),/bank-list-shape/);
 const fifty=Array.from({length:50},(_,i)=>({...retained,connectionId:id.slice(0,-4)+i.toString(16).padStart(4,'0')}));
 assert.equal(p.parsePrivateMobileBankReadResult({connections:fifty}).connections.length,50);
 for(const op of ['connect','sync']) assert.deepEqual(p.parsePrivateMobileBankMutationResult({operation:op,connection:active}),{operation:op,connection:active});
 const revoked={...active,status:'REVOKED'};
 assert.deepEqual(p.parsePrivateMobileBankMutationResult({operation:'disconnect',connection:revoked}),{operation:'disconnect',connection:revoked});
 for(const body of [{operation:'read',connection:active},{operation:'disconnect',connection:active},{operation:'connect',connection:revoked},{operation:'sync',connection:revoked},{operation:'connect',connection:null},{operation:'connect',connection:active,replayed:true}]) assert.throws(()=>p.parsePrivateMobileBankMutationResult(body));
 assert.throws(()=>p.parsePrivateMobileBankReadResult({connections:[],ownerId:id}));
 assert.equal(Object.keys(p.PRIVATE_MOBILE_BANK_PATHS).length,4);
});
