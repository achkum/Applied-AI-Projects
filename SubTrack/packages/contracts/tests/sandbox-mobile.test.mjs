import test from 'node:test';
import assert from 'node:assert/strict';
import {sandboxObject,parseSandboxRequestKey,parseSandboxSecret,parseSandboxBootstrap,parseSandboxTransport,parseSandboxBusiness,parseSandboxCredentials,parseSandboxProblem,SANDBOX_BUSINESS_OPERATIONS,SANDBOX_PROBLEM_CODES,parseSandboxBankHistory} from '../sandbox-mobile.ts';
const id=['123e4567','e89b','42d3','a456','426614174000'].join('-');
const cap='s250c.'+'a'.repeat(42)+'A',refresh='s250r.'+'b'.repeat(42)+'E';
const credentials=()=>({transport:'sandbox-mobile',sessionId:id,accessToken:['header','payload','signature'].join('.'),refreshToken:refresh,sessionExpiresAt:1000});
test('sandbox namespaces and exact public five-route input boundary',()=>{
 assert.deepEqual(parseSandboxBootstrap({transport:'sandbox-mobile',locale:'en'}),{transport:'sandbox-mobile',locale:'en'});assert.deepEqual(parseSandboxTransport({transport:'sandbox-mobile'}),{transport:'sandbox-mobile'});assert.equal(parseSandboxRequestKey(id),id);assert.equal(parseSandboxSecret(cap,'capability'),cap);assert.equal(parseSandboxSecret(refresh,'refresh'),refresh);
 for(const value of [undefined,1,'',id.toUpperCase(),id.replace('42d3','12d3')])assert.throws(()=>parseSandboxRequestKey(value));
 for(const [value,kind] of [[1,'capability'],['v2r.'+'a'.repeat(43),'refresh'],[cap,'refresh'],[refresh,'capability'],['s250c.'+'a'.repeat(43),'capability'],[cap,'unknown']])assert.throws(()=>parseSandboxSecret(value,kind));
 for(const value of [{transport:'mobile',locale:'en'},{transport:'sandbox-mobile',locale:'fr'},{transport:'sandbox-mobile',locale:'en',ownerId:id}])assert.throws(()=>parseSandboxBootstrap(value));assert.throws(()=>parseSandboxTransport({transport:'mobile'}));
});
test('all isolated business operations retain strict reviewed source parsers and no owner selector',()=>{
 const bodies={'profile-read':{},profile:{displayName:'Fictional tester'},'mode-read':{},mode:{mode:'just-me'},'owner-read':{},manual:{customName:'Fictional subscription',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',expectedAmountMinor:'12990',nextChargeDate:null},'manual-edit':{id,customName:'Fictional subscription',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',expectedAmountMinor:'12990',nextChargeDate:null,expectedRevision:'1'},status:{id,status:'PAUSED'},'subscription-status':{id,status:'PAUSED'},'subscription-edit':{id,customName:'Fictional subscription',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',expectedAmountMinor:'12990',nextChargeDate:null,expectedRevision:'1'},'bank-read':{},'bank-history':{},'bank-connect':{institutionId:'synthetic-demo-v1'},'bank-sync':{connectionId:id},'bank-disconnect':{connectionId:id,purge:true},'detection-read':{},'detection-scan':{},'detection-confirm':{candidateId:id,expectedRevision:'1'},'detection-reject':{candidateId:id,expectedRevision:'1'},'detection-undo':{receiptId:id},'household-read':{},'household-create':{name:'Family'},'household-rename':{name:'Family'},'dependant-add':{requestId:id,displayName:'Member'},'dependant-edit':{memberId:id,displayName:'Member'},'dependant-remove':{memberId:id},'household-assign':{subscriptionId:id,memberIds:[id],payerMemberId:null}};
 for(const operation of SANDBOX_BUSINESS_OPERATIONS){const parsed=parseSandboxBusiness({operation,body:bodies[operation]});assert.equal(parsed.operation,operation);assert.ok(Object.isFrozen(parsed));assert.ok(Object.isFrozen(parsed.body));assert.throws(()=>parseSandboxBusiness({operation,body:{...bodies[operation],ownerId:id}}));}
 assert.throws(()=>parseSandboxBusiness({operation:'bank',body:{}}));assert.throws(()=>parseSandboxBusiness({operation:'manual',body:{...bodies.manual,expectedAmountMinor:12990}}));
});
test('credential disclosure is exact and capability only appears once on bootstrap',()=>{
 const normal=credentials();assert.deepEqual(parseSandboxCredentials(normal,false),normal);assert.deepEqual(parseSandboxCredentials({...normal,installationCapability:cap},true),{...normal,installationCapability:cap});assert.ok(Object.isFrozen(parseSandboxCredentials(normal,false)));
 assert.throws(()=>parseSandboxCredentials({...normal,installationCapability:cap},false));assert.throws(()=>parseSandboxCredentials(normal,true));assert.throws(()=>parseSandboxCredentials(normal,'true'));
 for(const [field,values] of Object.entries({transport:['mobile'],sessionId:[1,'invalid'],accessToken:[1,'x'.repeat(4097),'one.part'],refreshToken:[cap],sessionExpiresAt:['1000',0,1.1,Number.MAX_SAFE_INTEGER+1]}))for(const value of values)assert.throws(()=>parseSandboxCredentials({...normal,[field]:value},false));
});
test('closed problem status/code pairs never echo unknown private details',()=>{
 for(const [status,codes] of Object.entries(SANDBOX_PROBLEM_CODES))for(const code of codes){const input={type:'about:blank',title:'Sandbox request unavailable',status:Number(status),code};assert.deepEqual(parseSandboxProblem(input),input);}
 for(const input of [{type:'elsewhere',title:'Sandbox request unavailable',status:400,code:'INVALID_SANDBOX_REQUEST'},{type:'about:blank',title:'private detail',status:400,code:'INVALID_SANDBOX_REQUEST'},{type:'about:blank',title:'Sandbox request unavailable',status:'400',code:'INVALID_SANDBOX_REQUEST'},{type:'about:blank',title:'Sandbox request unavailable',status:403,code:'INVALID_SANDBOX_REQUEST'},{type:'about:blank',title:'Sandbox request unavailable',status:400,code:1},{type:'about:blank',title:'Sandbox request unavailable',status:400,code:'SANDBOX_UNAVAILABLE'}])assert.throws(()=>parseSandboxProblem(input));
});
test('hostile properties fail before accessors or prototype selectors execute',()=>{
 for(const input of [null,undefined,[],true,Object.create(null),Object.assign(Object.create({transport:'sandbox-mobile'}),{})])assert.throws(()=>sandboxObject(input,[]));
 let read=false;const getter={};Object.defineProperty(getter,'transport',{enumerable:true,get(){read=true;return 'sandbox-mobile';}});assert.throws(()=>parseSandboxTransport(getter));assert.equal(read,false);
 const hidden={};Object.defineProperty(hidden,'transport',{value:'sandbox-mobile',enumerable:false});assert.throws(()=>parseSandboxTransport(hidden));assert.throws(()=>parseSandboxTransport({unknown:'sandbox-mobile'}));assert.throws(()=>parseSandboxTransport({[Symbol('private')]:'sandbox-mobile'}));assert.throws(()=>parseSandboxTransport({}));
});

test('booked bank history validates bounded signed minor units, dates and source attribution without private selectors',()=>{
 const item={id,subscriptionId:null,displayName:'Fictional merchant',date:'2026-10-17',amountMinor:'-14900',currency:'SEK'},value={items:[item],nextCursor:null};assert.deepEqual(parseSandboxBankHistory(value),value);
 for(const field of [{amountMinor:'0'},{amountMinor:'1.5'},{amountMinor:'-9223372036854775809'},{date:'2026-02-30'},{currency:'USD'},{subscriptionId:'foreign'},{displayName:'bad\ntext'}])assert.throws(()=>parseSandboxBankHistory({...value,items:[{...item,...field}]}));
 assert.throws(()=>parseSandboxBankHistory({...value,items:[item,item]}));assert.throws(()=>parseSandboxBankHistory({...value,nextCursor:'unbounded'}));let reads=0;const array=[item];Object.defineProperty(array,0,{get(){reads++;return item;},enumerable:true});assert.throws(()=>parseSandboxBankHistory({...value,items:array}));assert.equal(reads,0);
});
