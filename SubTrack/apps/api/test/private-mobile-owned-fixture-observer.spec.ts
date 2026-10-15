import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:https';
import { describe, expect, it } from 'vitest';
import { createOwnedOtpStartObserver,OwnedInitialDetectionScanObserver,safeInitialScanObservation } from './private-mobile-owned-fixture-observer';
import {PRIVATE_MOBILE_DETECTION_STATEMENTS as sql} from '../src/detection/private-mobile-detection-statements.js';

describe('initial detection scan RAM-only SQL observation',()=>{
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
