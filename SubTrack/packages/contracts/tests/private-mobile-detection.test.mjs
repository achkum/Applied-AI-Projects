import assert from 'node:assert/strict';
import test from 'node:test';
import * as p from '../private-mobile-detection.ts';
const id='123e4567-e89b-42d3-a456-426614174000';
const candidate={id,revision:'1',displayName:'Netflix',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',expectedAmountMinor:'14900',currency:'SEK',confidence:0.9,reasons:['MERCHANT_RESOLVED','CADENCE_MATCHED'],status:'DETECTED'};
test('strict request scope, current revision and key grammar',()=>{
 assert.deepEqual(p.parsePrivateMobileDetectionScan({}),{});assert.deepEqual(p.parsePrivateMobileDetectionRead({}),{});assert.deepEqual(p.parsePrivateMobileDetectionRead({cursor:'abc'}),{cursor:'abc'});
 assert.deepEqual(p.parsePrivateMobileDetectionReview({candidateId:id,expectedRevision:'9223372036854775807'}),{candidateId:id,expectedRevision:'9223372036854775807'});assert.deepEqual(p.parsePrivateMobileDetectionUndo({receiptId:id}),{receiptId:id});
 for(const [parse,body]of [[p.parsePrivateMobileDetectionScan,{}],[p.parsePrivateMobileDetectionRead,{}],[p.parsePrivateMobileDetectionReview,{candidateId:id,expectedRevision:'1'}],[p.parsePrivateMobileDetectionUndo,{receiptId:id}]]){
  for(const v of [null,undefined,false,1,'x',[],new Date()])assert.throws(()=>parse(v));
  assert.deepEqual(parse(Object.assign(Object.create(null),body)),parse(body));
  for(const k of ['ownerId','accountId','transactionId','source','status','persona','amountMinor'])assert.throws(()=>parse({...body,[k]:'private-canary'}));
  assert.throws(()=>parse({...body,[Symbol('hidden')]:'private-canary'}));
  for(const field of [...Object.keys(body),'extra']){const getter={...body};Object.defineProperty(getter,field,{get(){throw Error('getter-executed');},enumerable:true});assert.throws(()=>parse(getter),/detection-shape/);}
 }
 for(const candidateId of ['bad',id.toUpperCase(),null,1])assert.throws(()=>p.parsePrivateMobileDetectionReview({candidateId,expectedRevision:'1'}));
 for(const expectedRevision of ['0','01','-1','9223372036854775808','1.0',1,null])assert.throws(()=>p.parsePrivateMobileDetectionReview({candidateId:id,expectedRevision}));
 for(const cursor of [null,'','a'.repeat(513),'a=',1])assert.throws(()=>p.parsePrivateMobileDetectionRead({cursor}));
 assert.equal(p.parsePrivateMobileDetectionRequestKey('read',undefined),null);assert.throws(()=>p.parsePrivateMobileDetectionRequestKey('read','x'.repeat(16)));
 for(const op of ['scan','confirm','reject','undo']){assert.equal(p.parsePrivateMobileDetectionRequestKey(op,'x'.repeat(16)),'x'.repeat(16));assert.equal(p.parsePrivateMobileDetectionRequestKey(op,'~'.repeat(255)),'~'.repeat(255));for(const k of [undefined,null,1,'x'.repeat(15),'x'.repeat(256),' '.repeat(16),'\n'.repeat(16),'é'.repeat(16)])assert.throws(()=>p.parsePrivateMobileDetectionRequestKey(op,k));}
 assert.throws(()=>p.parsePrivateMobileDetectionRequestKey('other','x'.repeat(16)));
});
test('candidate projection excludes private evidence and preserves bigint wire',()=>{
 assert.deepEqual(p.parsePrivateMobileDetectionCandidate(candidate),candidate);
 assert.equal(p.parsePrivateMobileDetectionCandidate({...candidate,expectedAmountMinor:'9223372036854775807'}).expectedAmountMinor,'9223372036854775807');
 for(const [field,values]of Object.entries({displayName:[' Netflix','',null,'private\n'],categoryCode:['SALARY'],cadence:['CUSTOM'],expectedAmountMinor:['0','9223372036854775808',14900],currency:['sek','S',null],confidence:[null,'0.9',NaN,Infinity,-1,1.1,-0],status:['ACTIVE']}))for(const v of values)assert.throws(()=>p.parsePrivateMobileDetectionCandidate({...candidate,[field]:v}));
 for(const reasons of [null,{},[],['PRIVATE_REASON'],[1],['CADENCE_MATCHED','CADENCE_MATCHED'],Array(7).fill('CADENCE_MATCHED'),Object.assign(['CADENCE_MATCHED'],{extra:'private'}),new Array(1)])assert.throws(()=>p.parsePrivateMobileDetectionCandidate({...candidate,reasons}));
 const getter=['CADENCE_MATCHED'];Object.defineProperty(getter,'0',{get(){throw Error('getter');}});assert.throws(()=>p.parsePrivateMobileDetectionCandidate({...candidate,reasons:getter}),/detection-shape/);
 const inherited=['CADENCE_MATCHED'];Object.setPrototypeOf(inherited,{});assert.throws(()=>p.parsePrivateMobileDetectionCandidate({...candidate,reasons:inherited}));
 for(const field of ['rawDescription','accountId','transactionId','reasonParams'])assert.throws(()=>p.parsePrivateMobileDetectionCandidate({...candidate,[field]:'private-canary'}));
 for(const confidence of [0,1])assert.equal(p.parsePrivateMobileDetectionCandidate({...candidate,confidence}).confidence,confidence);
});
test('bounded terminal pages and immutable review snapshots',()=>{
 assert.deepEqual(p.parsePrivateMobileDetectionScanResult({scan:'complete'}),{scan:'complete'});assert.throws(()=>p.parsePrivateMobileDetectionScanResult({scan:'other'}));
 assert.deepEqual(p.parsePrivateMobileDetectionReadResult({items:[],nextCursor:null}),{items:[],nextCursor:null});
 assert.throws(()=>p.parsePrivateMobileDetectionReadResult({items:[candidate,candidate],nextCursor:null}));assert.throws(()=>p.parsePrivateMobileDetectionReadResult({items:[candidate],nextCursor:'abc'}));
 const items=Array.from({length:50},(_,i)=>({...candidate,id:`123e4567-e89b-42d3-a456-${String(i).padStart(12,'0')}`}));assert.equal(p.parsePrivateMobileDetectionReadResult({items,nextCursor:'abc'}).items.length,50);assert.throws(()=>p.parsePrivateMobileDetectionReadResult({items:[...items,candidate],nextCursor:null}));assert.throws(()=>p.parsePrivateMobileDetectionReadResult({items,nextCursor:1}));
 for(const status of ['ACTIVE','REJECTED','DETECTED']){const r={candidateId:id,status,revision:'2',receiptId:id,undoUntil:status==='DETECTED'?null:'2026-10-14T00:00:10.000Z'};assert.deepEqual(p.parsePrivateMobileDetectionReviewResult(r),r);assert.throws(()=>p.parsePrivateMobileDetectionReviewResult({...r,undoUntil:status==='DETECTED'?'2026-10-14T00:00:10.000Z':null}));}
 const r={candidateId:id,status:'ACTIVE',revision:'2',receiptId:id,undoUntil:'2026-10-14T00:00:10.000Z'};
 for(const undoUntil of [1,'bad','0000-10-14T00:00:10.000Z','2026-02-30T00:00:10.000Z','2026-10-14T00:00:10Z','2026-10-14T00:00:10.000+00:00'])assert.throws(()=>p.parsePrivateMobileDetectionReviewResult({...r,undoUntil}));
 assert.throws(()=>p.parsePrivateMobileDetectionReviewResult({...r,status:'PAUSED'}));assert.throws(()=>p.parsePrivateMobileDetectionReviewResult({...r,receiptId:'bad'}));
});
