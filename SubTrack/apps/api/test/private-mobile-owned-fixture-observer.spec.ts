import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:https';
import { describe, expect, it, vi } from 'vitest';
import * as bankDiagnostics from './private-mobile-bank-diagnostics.js';
import { createOwnedOtpStartObserver,createOwnedManualSaveObserver,createOwnedAllApiObserver,OwnedInitialDetectionScanObserver,safeInitialScanObservation } from './private-mobile-owned-fixture-observer';
import {PRIVATE_MOBILE_DETECTION_STATEMENTS as sql} from '../src/detection/private-mobile-detection-statements.js';

describe('initial detection scan RAM-only SQL observation',()=>{
 it('ignores non-string query metadata and labels an unmapped named operation honestly',async()=>{
  const observer=new OwnedInitialDetectionScanObserver(),result=Object.freeze({accepted:true}),promise=Promise.resolve(result);observer.begin();await observer.query(sql.detectionActiveGenerationLock,()=>promise);
  expect(observer.query(null,()=>promise)).toBe(promise);expect(observer.observation()).toEqual({lastOperation:'GENERATION_LOCK'});
  expect(await observer.query(sql.detectionScanReceiptRead,()=>promise)).toBe(result);expect(observer.observation()).toEqual({lastOperation:'UNKNOWN'});observer.clear();
 });
 it('fails closed if host reflection fails without propagating its private exception',()=>{
  const reflection=vi.spyOn(Object,'getOwnPropertyDescriptors').mockImplementationOnce(()=>{throw new Error('private reflection canary');});let result:unknown;
  try{result=safeInitialScanObservation({lastOperation:'BOOKED_READ'});}finally{reflection.mockRestore();}expect(result).toBe(false);
 });
 it('downgrades an unexpected mapper category without changing the original SQL error',async()=>{
  const mapper=vi.spyOn(bankDiagnostics,'privateBankFailureCategory').mockReturnValueOnce('ASSERTION'),observer=new OwnedInitialDetectionScanObserver(),error=Object.assign(new Error('private SQL canary'),{code:'42501'});observer.begin();
  try{await expect(observer.query(sql.detectionBookedRows,async()=>{throw error;})).rejects.toBe(error);expect(observer.observation()).toEqual({operation:'BOOKED_READ',sqlCategory:'OTHER'});}finally{mapper.mockRestore();observer.clear();}
 });
 it('is passive outside scope and returns the original promise/result/error',async()=>{
  const observer=new OwnedInitialDetectionScanObserver(),result=Object.freeze({privateRow:'canary'}),promise=Promise.resolve(result);
  expect(observer.query(sql.detectionBookedRows,()=>promise)).toBe(promise);expect(await promise).toBe(result);expect(observer.observation()).toBeUndefined();
  observer.begin();const foreign=Promise.resolve(result);expect(observer.query('private unrelated SQL',()=>foreign)).toBe(foreign);expect(await observer.query(sql.detectionModeRead,()=>promise)).toBe(result);expect(observer.observation()).toEqual({lastOperation:'UNKNOWN'});expect(await observer.query(sql.detectionBookedRows,()=>promise)).toBe(result);expect(observer.observation()).toEqual({lastOperation:'BOOKED_READ'});
  const error=Object.assign(new Error('private SQL/error/owner'),{code:'23503'});await expect(observer.query(sql.detectionSubscriptionInsert,async()=>{throw error;})).rejects.toBe(error);expect(observer.observation()).toEqual({operation:'CANDIDATE_WRITE',sqlCategory:'FOREIGN_KEY'});expect(JSON.stringify(observer.observation())).not.toContain('private');
 });
 it('retains the first failure only and clears scope without late-query contamination',async()=>{
  const observer=new OwnedInitialDetectionScanObserver();observer.begin();expect(()=>observer.begin()).toThrow();
  for(const [statement,code] of [[sql.detectionActiveGenerationLock,'42501'],[sql.detectionBookedRows,'23514']] as const){const error=Object.assign(new Error('canary'),{code});await expect(observer.query(statement,async()=>{throw error;})).rejects.toBe(error);}
  await observer.query(sql.detectionScanReceiptInsert,async()=>undefined);expect(observer.observation()).toEqual({operation:'GENERATION_LOCK',sqlCategory:'PERMISSION'});expect(Object.isFrozen(observer.observation())).toBe(true);
  observer.clear();expect(observer.observation()).toBeUndefined();observer.begin();let resolve!:()=>void;const pending=observer.query(sql.detectionBookedRows,()=>new Promise<void>(ok=>{resolve=ok;}));observer.clear();observer.begin();resolve();await pending;expect(observer.observation()).toEqual({lastOperation:'UNKNOWN'});observer.clear();
 });
 it('maps closed own SQL codes and never invokes private accessors or proxy traps',async()=>{
  const codes={42501:'PERMISSION',42703:'UNDEFINED_COLUMN','42P01':'UNDEFINED_TABLE',23503:'FOREIGN_KEY',23505:'UNIQUE',23514:'CHECK',23502:'NOT_NULL',42804:'TYPE_MISMATCH','22P02':'INVALID_INPUT',22003:'NUMERIC_RANGE',40001:'SERIALIZATION','40P01':'DEADLOCK',private:'OTHER'};
  for(const [code,category] of Object.entries(codes)){const observer=new OwnedInitialDetectionScanObserver();observer.begin();const error=Object.assign(new Error('canary'),{code});await expect(observer.query(sql.detectionBookedRows,async()=>{throw error;})).rejects.toBe(error);expect(observer.observation()).toEqual({operation:'BOOKED_READ',sqlCategory:category});}
  let invoked=false;const accessor=new Error('canary');Object.defineProperty(accessor,'code',{get(){invoked=true;return '42501';}});const proxy=new Proxy(new Error('canary'),{getOwnPropertyDescriptor(){invoked=true;throw Error('canary');},getPrototypeOf(){invoked=true;throw Error('canary');}});
  for(const error of [accessor,proxy,{code:'42501'},'private']){const observer=new OwnedInitialDetectionScanObserver();observer.begin();try{await observer.query(sql.detectionBookedRows,async()=>{throw error;});}catch(actual){expect(actual===error).toBe(true);}expect(observer.observation()).toEqual({operation:'BOOKED_READ',sqlCategory:'OTHER'});}expect(invoked).toBe(false);
 });
 it('rejects private/hostile observation objects without reading accessors',()=>{
  expect(safeInitialScanObservation({lastOperation:'UNKNOWN'})).toBe(true);expect(safeInitialScanObservation({operation:'BOOKED_READ',sqlCategory:'CHECK'})).toBe(true);
  let invoked=false;const accessor={get lastOperation(){invoked=true;return 'BOOKED_READ';}},proxy=new Proxy({},{ownKeys(){invoked=true;throw Error('private');}});
  for(const value of [accessor,proxy,null,[],{lastOperation:'private'},{operation:'BOOKED_READ',sqlCategory:'CHECK',owner:'private'},{operation:'BOOKED_READ'},{lastOperation:'BOOKED_READ',sqlCategory:'OTHER'}])expect(safeInitialScanObservation(value)).toBe(false);expect(invoked).toBe(false);
 });
});

function fixture() {
  const server = new EventEmitter();
  const observer = createOwnedOtpStartObserver();
  observer.attach(server as Server);
  const response = (statusCode = 202) => Object.assign(new EventEmitter(), { statusCode }) as ServerResponse;
  const request = (output: ServerResponse, method = 'POST', url = '/v2/auth/otp/start') =>
    server.emit('request', { method, url } as IncomingMessage, output);
  return { server, observer, response, request };
}

describe('passive owned OTP start observations', () => {
  it('ignores every non-exact method/path and never accesses private request fields', () => {
    const f = fixture();
    for (const [method, url] of [['GET', '/v2/auth/otp/start'], ['POST', '/v2/auth/otp/start?secret=private-canary'], ['POST', '/v2/auth/otp/verify']])
      f.request(f.response(), method, url);
    const input = { method: 'POST', url: '/v2/auth/otp/start', get headers() { throw Error('private-canary'); }, get body() { throw Error('private-canary'); } };
    const output = f.response();
    f.server.emit('request', input, output);
    expect(f.observer.observation().arrivals).toBe('one');
    expect(f.observer.observation().incomplete).toBe('one');
    expect(JSON.stringify(f.observer.observation())).not.toContain('private-canary');
    output.emit('finish');
    expect(f.observer.observation().accepted202).toBe('one');
    expect(f.observer.observation().incomplete).toBe('zero');
  });

  it('counts finish once, removes listeners and reports only closed status buckets', () => {
    const f = fixture();
    const statuses = [202, 202, 400, 499, 500, 599, 200, 399, 600];
    for (const code of statuses) {
      const output = f.response(code);
      f.request(output);
      output.emit('finish'); output.emit('close'); output.emit('finish');
      expect(output.listenerCount('finish')).toBe(0);
      expect(output.listenerCount('close')).toBe(0);
    }
    expect(f.observer.observation()).toEqual({ arrivals: 'multiple', accepted202: 'multiple', rejected4xx: 'multiple', failed5xx: 'multiple', other: 'multiple', incomplete: 'zero' });
    expect(Object.isFrozen(f.observer.observation())).toBe(true);
  });

  it('pending or aborted response is incomplete and duplicate late callbacks cannot count twice', () => {
    const f = fixture();
    const output = f.response(); f.request(output);
    const finish = output.listeners('finish')[0] as () => void;
    const close = output.listeners('close')[0] as () => void;
    close(); finish(); close();
    expect(f.observer.observation()).toEqual({ arrivals: 'one', accepted202: 'zero', rejected4xx: 'zero', failed5xx: 'zero', other: 'zero', incomplete: 'one' });
    f.request(f.response());
    expect(f.observer.observation().incomplete).toBe('multiple');
  });

  it('stop and restart remove housekeeping listeners, reset buckets and fence stale callbacks', () => {
    const f = fixture();
    const first = f.response(); f.request(first);
    const finish = first.listeners('finish')[0] as () => void;
    const close = first.listeners('close')[0] as () => void;
    const oldRequest = f.server.listeners('request')[0] as (input: IncomingMessage, output: ServerResponse) => void;
    f.observer.stop();
    oldRequest({ method: 'POST', url: '/v2/auth/otp/start' } as IncomingMessage, f.response());
    finish(); close();
    expect(f.server.listenerCount('request')).toBe(0);
    expect(first.listenerCount('finish') + first.listenerCount('close')).toBe(0);
    expect(f.observer.observation().arrivals).toBe('zero');
    f.observer.attach(f.server as Server);
    oldRequest({ method: 'POST', url: '/v2/auth/otp/start' } as IncomingMessage, f.response());
    finish(); close();
    expect(f.observer.observation().arrivals).toBe('zero');
    expect(f.observer.observation().accepted202).toBe('zero');
    const second = f.response(404); f.request(second); second.emit('finish');
    expect(f.observer.observation().rejected4xx).toBe('one');
    f.observer.attach(f.server as Server);
    expect(f.server.listenerCount('request')).toBe(1);
    expect(f.observer.observation().arrivals).toBe('zero');
    f.observer.stop(); f.observer.stop();
  });
});

function manualFixture() {
  const server = new EventEmitter();
  const observer = createOwnedManualSaveObserver();
  observer.attach(server as Server);
  const response = (statusCode = 201) => Object.assign(new EventEmitter(), { statusCode }) as ServerResponse;
  const request = (output: ServerResponse, method = 'POST', url = '/v2/private/mobile/subscriptions/owner/manual') =>
    server.emit('request', { method, url } as IncomingMessage, output);
  return { server, observer, response, request };
}

describe('passive owned manual save observations', () => {
  it('does not intercept response errors or alter existing error listeners', () => {
    const f=manualFixture(),output=f.response(),error=new Error('private response canary');f.request(output);
    expect(output.listenerCount('error')).toBe(0);let thrown:unknown;try{output.emit('error',error);}catch(value){thrown=value;}expect(thrown).toBe(error);expect(f.observer.observation().incomplete).toBe('one');
    let received:unknown;output.on('error',value=>{received=value;});output.emit('error',error);expect(received).toBe(error);expect(output.listenerCount('error')).toBe(1);output.emit('close');expect(output.listenerCount('error')).toBe(1);expect(f.observer.observation().incomplete).toBe('one');expect(JSON.stringify(f.observer.observation())).not.toContain('private');
  });
  it('ignores every non-exact method/path and never accesses private request fields', () => {
    const f = manualFixture();
    for (const [method, url] of [['GET', '/v2/private/mobile/subscriptions/owner/manual'], ['POST', '/v2/private/mobile/subscriptions/owner/manual?secret=private-canary'], ['POST', '/v2/auth/otp/verify']])
      f.request(f.response(), method, url);
    const input = { method: 'POST', url: '/v2/private/mobile/subscriptions/owner/manual', get headers() { throw Error('private-canary'); }, get body() { throw Error('private-canary'); } };
    const output = f.response();
    f.server.emit('request', input, output);
    expect(f.observer.observation().arrivals).toBe('one');
    expect(f.observer.observation().incomplete).toBe('one');
    expect(JSON.stringify(f.observer.observation())).not.toContain('private-canary');
    output.emit('finish');
    expect(f.observer.observation().finished201).toBe('one');
    expect(f.observer.observation().incomplete).toBe('zero');
  });

  it('counts finish once, removes listeners and reports only closed status buckets', () => {
    const f = manualFixture();
    const statuses = [201, 201, 400, 499, 500, 599, 200, 399, 600];
    for (const code of statuses) {
      const output = f.response(code);
      f.request(output);
      output.emit('finish'); output.emit('close'); output.emit('finish');
      expect(output.listenerCount('finish')).toBe(0);
      expect(output.listenerCount('close')).toBe(0);
    }
    expect(f.observer.observation()).toEqual({ arrivals: 'multiple', finished201: 'multiple', rejected4xx: 'multiple', failed5xx: 'multiple', other: 'multiple', incomplete: 'zero' });
    expect(Object.isFrozen(f.observer.observation())).toBe(true);
  });

  it('pending or aborted response is incomplete and duplicate late callbacks cannot count twice', () => {
    const f = manualFixture();
    const output = f.response(); f.request(output);
    const finish = output.listeners('finish')[0] as () => void;
    const close = output.listeners('close')[0] as () => void;
    close(); finish(); close();
    expect(f.observer.observation()).toEqual({ arrivals: 'one', finished201: 'zero', rejected4xx: 'zero', failed5xx: 'zero', other: 'zero', incomplete: 'one' });
    f.request(f.response());
    expect(f.observer.observation().incomplete).toBe('multiple');
  });

  it('stop and restart remove housekeeping listeners, reset buckets and fence stale callbacks', () => {
    const f = manualFixture();
    const first = f.response(); f.request(first);
    const finish = first.listeners('finish')[0] as () => void;
    const close = first.listeners('close')[0] as () => void;
    const oldRequest = f.server.listeners('request')[0] as (input: IncomingMessage, output: ServerResponse) => void;
    f.observer.stop();
    oldRequest({ method: 'POST', url: '/v2/private/mobile/subscriptions/owner/manual' } as IncomingMessage, f.response());
    finish(); close();
    expect(f.server.listenerCount('request')).toBe(0);
    expect(first.listenerCount('finish') + first.listenerCount('close')).toBe(0);
    expect(f.observer.observation().arrivals).toBe('zero');
    f.observer.attach(f.server as Server);
    oldRequest({ method: 'POST', url: '/v2/private/mobile/subscriptions/owner/manual' } as IncomingMessage, f.response());
    finish(); close();
    expect(f.observer.observation().arrivals).toBe('zero');
    expect(f.observer.observation().finished201).toBe('zero');
    const second = f.response(404); f.request(second); second.emit('finish');
    expect(f.observer.observation().rejected4xx).toBe('one');
    f.observer.attach(f.server as Server);
    expect(f.server.listenerCount('request')).toBe(1);
    expect(f.observer.observation().arrivals).toBe('zero');
    f.observer.stop(); f.observer.stop();
  });
});


describe('first owned OTP response closed metadata',()=>{
 const body=(status=400,code='INVALID_MOBILE_REQUEST')=>JSON.stringify({type:'about:blank',title:status===400?'Bad Request':status===409?'Conflict':'Too Many Requests',status,code});
 function output(f:ReturnType<typeof fixture>,status=400){const r=f.response(status);const original=vi.fn(function(this:unknown,...args:unknown[]){return {receiver:this,args};});Object.assign(r,{end:original,headersSent:false});return {r,original};}
 it('classifies all exact public pairs only after finish and restores the original descriptor',()=>{
  for(const status of [400,409,429])for(const code of ['INVALID_MOBILE_REQUEST','AUTH_RESTART_REQUIRED']){const f=fixture(),{r,original}=output(f,status);const descriptor=Object.getOwnPropertyDescriptor(r,'end');expect(f.observer.firstResponse()).toEqual({state:'unavailable',status:'OTHER',code:'OTHER'});f.request(r);expect(f.observer.firstResponse().state).toBe('incomplete');const args=[body(status,code)],result=Reflect.apply(r.end,r,args);expect(result).toEqual({receiver:r,args});expect(original).toHaveBeenCalledExactlyOnceWith(...args);expect(f.observer.firstResponse().state).toBe('incomplete');r.emit('finish');expect(f.observer.firstResponse()).toEqual({state:'complete',status:String(status),code});expect(Object.isFrozen(f.observer.firstResponse())).toBe(true);expect(Object.getOwnPropertyDescriptor(r,'end')).toEqual(descriptor);}
 });
 it('keeps malformed, oversized, streamed, overloaded and hostile values opaque without coercion',()=>{
  let touched=false;const hostile=new Proxy({},{get(){touched=true;throw Error('private');},ownKeys(){touched=true;throw Error('private');}});
  for(const args of [[],[body(),'utf8'],[body(),()=>undefined],[null],[Buffer.from(body())],[hostile],['x'.repeat(4097)],[''],[' '+body()],[body(400,'UNKNOWN')],[body(409)]]){const f=fixture(),{r}=output(f);f.request(r);Reflect.apply(r.end,r,args);r.emit('finish');expect(f.observer.firstResponse()).toEqual({state:'complete',status:'400',code:'OTHER'});}
  expect(touched).toBe(false);
  for(const state of ['streamed','repeated','changed','success']){const f=fixture(),{r}=output(f,state==='success'?202:400);f.request(r);if(state==='streamed')Object.assign(r,{headersSent:true});r.end(body());if(state==='repeated')r.end(body());if(state==='changed')r.statusCode=409;r.emit('finish');expect(f.observer.firstResponse().code).toBe('OTHER');}
 });
 it('forwards callbacks, return values, foreign receivers and thrown identities without changing observations',()=>{
  const f=fixture(),{r}=output(f);const error=Error('private'),callback=vi.fn(),original=vi.fn(function(this:unknown,...args:unknown[]){if(args[0]==='throw')throw error;return callback;});r.end=original as unknown as ServerResponse['end'];f.request(r);const wrapped=r.end;
  expect(Reflect.apply(wrapped,{},['foreign',callback])).toBe(callback);expect(()=>Reflect.apply(wrapped,{},['throw'])).toThrow(error);expect(()=>Reflect.apply(wrapped,r,['throw'])).toThrow(error);r.emit('finish');expect(f.observer.firstResponse()).toEqual({state:'complete',status:'400',code:'OTHER'});expect(callback).not.toHaveBeenCalled();
  f.observer.stop();expect(()=>Reflect.apply(wrapped,r,['throw'])).toThrow(error);expect(f.observer.firstResponse().state).toBe('unavailable');
 });
 it('binds the first request only and restores inherited methods on close and stop with stale callbacks fenced',()=>{
  for(const cleanup of ['close','stop']){const f=fixture(),{r:second}=output(f,429),r=f.response(400);const original=vi.fn();Object.setPrototypeOf(r,Object.assign(Object.create(Object.getPrototypeOf(r)),{end:original}));f.request(r);const end=r.end,finish=r.listeners('finish')[0] as ()=>void;f.request(second);second.end(body(429));second.emit('finish');expect(f.observer.firstResponse().state).toBe('incomplete');if(cleanup==='close')r.emit('close');else f.observer.stop();expect(Object.hasOwn(r,'end')).toBe(false);Reflect.apply(end,r,[body()]);finish();expect(f.observer.firstResponse().state).toBe(cleanup==='close'?'incomplete':'unavailable');expect(original).toHaveBeenCalledExactlyOnceWith(body());}
 });
 it('does not execute own accessors or replace unsupported end descriptors and still counts finish',()=>{
  let touched=false;
  for(const kind of ['accessor','fixed','nonfunction','sealed','hidden']){const f=fixture(),{r}=output(f);if(kind==='accessor')Object.defineProperty(r,'end',{configurable:true,get(){touched=true;throw Error('private');}});if(kind==='fixed')Object.defineProperty(r,'end',{configurable:false,value:()=>undefined});if(kind==='nonfunction')Object.assign(r,{end:null});if(kind==='sealed')Object.preventExtensions(r);if(kind==='hidden')Object.defineProperty(r,'end',{enumerable:false});const before=Object.getOwnPropertyDescriptor(r,'end');f.request(r);r.emit('finish');expect(Object.getOwnPropertyDescriptor(r,'end')).toEqual(before);expect(f.observer.firstResponse()).toEqual({state:'complete',status:'400',code:'OTHER'});expect(f.observer.observation().rejected4xx).toBe('one');}expect(touched).toBe(false);
 });
});

describe('all owned API arrival observation for strictly pre-input private capture',()=>{
 it('counts every request before handlers without accessing fields and preserves their error identity',()=>{
  const observer=createOwnedAllApiObserver(),server=new EventEmitter() as Server;expect(observer.observation()).toEqual({state:'unavailable',arrivals:'zero'});observer.stop();observer.attach(server);expect(observer.observation()).toEqual({state:'active',arrivals:'zero'});
  const hostile=new Proxy({},{get(){throw Error('Private field accessed');}}),original=new Error('Private handler canary');server.on('request',()=>{throw original;});expect(()=>server.emit('request',hostile,hostile)).toThrow(original);expect(observer.observation()).toEqual({state:'active',arrivals:'one'});
  server.removeAllListeners('request');observer.stop();observer.attach(server);server.emit('request',hostile,hostile);server.emit('request');expect(observer.observation()).toEqual({state:'unavailable',arrivals:'multiple'});observer.stop();expect(server.listenerCount('request')).toBe(0);
 });
 it('retires stale callbacks and never resets a positive history across a new graph',()=>{
  const observer=createOwnedAllApiObserver(),first=new EventEmitter() as Server,next=new EventEmitter() as Server;observer.attach(first);const stale=first.listeners('request')[0] as ()=>void;first.emit('request');observer.stop();stale();expect(observer.observation()).toEqual({state:'unavailable',arrivals:'one'});observer.attach(next);stale();expect(observer.observation()).toEqual({state:'unavailable',arrivals:'one'});next.emit('request');expect(observer.observation()).toEqual({state:'unavailable',arrivals:'multiple'});observer.stop();observer.stop();
 });
});

it('all API diagnostic attachment and listener cleanup failures cannot alter server errors',()=>{
 const observer=createOwnedAllApiObserver(),server=new EventEmitter() as Server;vi.spyOn(server,'prependListener').mockImplementationOnce(()=>{throw Error('private attach');});expect(()=>observer.attach(server)).not.toThrow();expect(observer.observation()).toEqual({state:'unavailable',arrivals:'zero'});observer.attach(server);const stale=server.listeners('request')[0] as ()=>void;vi.spyOn(server,'removeListener').mockImplementationOnce(()=>{throw Error('private cleanup');});expect(()=>observer.stop()).not.toThrow();stale();expect(observer.observation()).toEqual({state:'unavailable',arrivals:'zero'});
});
