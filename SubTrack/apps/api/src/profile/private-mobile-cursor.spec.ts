import {describe,it,expect,vi} from 'vitest';
import {parsePrivateMobileCursor as parse,encodePrivateMobileCursor as encode} from './private-mobile-cursor.js';
import {createPrivateMobileBusiness} from './private-mobile-business.js';
import type {DurablePrivateMobileAuthority} from '../auth/mobile-private/durable-mobile-authority.js';
const id='123e4567-e89b-42d3-a456-426614174000';const date='2026-10-13T00:00:00.123456Z';
const object={v:1,endpoint:'private-owner-subscriptions',createdAt:date,id};const raw=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
describe('private mobile cursor policy',()=>{
 it('preserves exact microseconds and valid boundary years with canonical encoding',()=>{
  expect(parse()).toBeNull();for(const value of [date,'0001-01-01T00:00:00.000001Z','9999-12-31T23:59:59.999999Z'])expect(parse(encode(value,id))).toEqual({createdAt:value,id});
 });
 it.each(['','a'.repeat(513),'a=','Zh',Buffer.from([0xff]).toString('base64url'),Buffer.from('{').toString('base64url')])('rejects malformed encoding %s',value=>expect(()=>parse(value)).toThrow());
 it.each([null,[],{}, {...object,v:2},{...object,endpoint:'other'},{...object,extra:1},{...object,createdAt:null},{...object,createdAt:'bad'},
  {...object,createdAt:'0000-01-01T00:00:00.000000Z'},{...object,createdAt:'2026-02-30T00:00:00.000000Z'},
  {...object,createdAt:'2026-13-01T00:00:00.000000Z'},{...object,id:null},{...object,id:'bad'},{...object,id:id.toUpperCase()}])('rejects invalid shape/calendar/UUID %j',value=>expect(()=>parse(raw(value))).toThrow());
 it('rejects noncanonical JSON and invalid outgoing projections',()=>{
  expect(()=>parse(Buffer.from(JSON.stringify(object,null,2)).toString('base64url'))).toThrow();
  for(const date of [null,'bad','0000-01-01T00:00:00.000000Z','2026-02-30T00:00:00.000000Z'])expect(()=>encode(date,id)).toThrow();
  expect(()=>encode(date,'bad')).toThrow();
 });
 it('rejects normalized-invalid/year-zero cursors before current authority and all list SQL',async()=>{
  const withCurrentMobileAuthority=vi.fn();const business=createPrivateMobileBusiness({withCurrentMobileAuthority} as unknown as DurablePrivateMobileAuthority);
  for(const createdAt of ['0000-01-01T00:00:00.000000Z','2026-02-30T00:00:00.000000Z'])await expect(business.execute('opaque','owner-read',{cursor:raw({...object,createdAt})})).rejects.toThrow('wire');
  expect(withCurrentMobileAuthority).not.toHaveBeenCalled();
 });
});
