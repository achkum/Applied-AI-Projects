import {describe,it,expect} from 'vitest';
import {privateMobileTrackingReceipt} from './private-mobile-tracking-receipt.js';
const marker='a'.repeat(32),id='123e4567-e89b-42d3-a456-426614174000';
const row={id,custom_name:'Native edited restart proof',source:'MANUAL',currency:'SEK',category_code:'VIDEO_STREAMING',cadence:'MONTHLY',expected_amount_minor:'12990',next_charge_date:null,always_private:true,status:'ARCHIVED',revision:'6'};
describe('closed actual native tracking fixture projection',()=>{
 it('publishes only stable hashes/count and validated flags, not fixture values',()=>{
  const value=privateMobileTrackingReceipt(marker,[row]);expect(value).toMatchObject({version:1,subscriptionCount:1,manualEditReadback:true,archivedReadback:true,revisionSixReadback:true});
  expect(Object.keys(value).sort()).toEqual(['version','markerHash','subscriptionCount','subscriptionIdentityHash','subscriptionDigest','manualEditReadback','archivedReadback','revisionSixReadback'].sort());
  for(const name of ['markerHash','subscriptionIdentityHash','subscriptionDigest'] as const)expect(value[name]).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(value)).not.toContain(row.id);expect(JSON.stringify(value)).not.toContain(row.custom_name);expect(Object.isFrozen(value)).toBe(true);
  expect(privateMobileTrackingReceipt(marker,[{...row}])).toEqual(value);
 });
 it('binds same-row identity separately from edited projection and fixture marker',()=>{
  const value=privateMobileTrackingReceipt(marker,[row]);const initial=privateMobileTrackingReceipt(marker,[{...row,custom_name:'Native restart proof',status:'ACTIVE',revision:'1'}]);
  expect(initial.subscriptionIdentityHash).toBe(value.subscriptionIdentityHash);expect(initial.subscriptionDigest).not.toBe(value.subscriptionDigest);expect(initial.manualEditReadback).toBe(false);expect(initial.archivedReadback).toBe(false);expect(initial.revisionSixReadback).toBe(false);
  expect(privateMobileTrackingReceipt('b'.repeat(32),[row]).markerHash).not.toBe(value.markerHash);
  expect(privateMobileTrackingReceipt(marker,[{...row,id:'123e4567-e89b-42d3-a456-426614174001'}]).subscriptionIdentityHash).not.toBe(value.subscriptionIdentityHash);
 });
 it('every protected fixture predicate must hold before native flags can qualify',()=>{
  for(const field of ['custom_name','source','currency','category_code','cadence','expected_amount_minor','next_charge_date','always_private'] as const){
   const changed={...row,[field]:field==='always_private'?false:'different'};expect(privateMobileTrackingReceipt(marker,[changed]).manualEditReadback).toBe(false);
  }
 });
 it('rejects wrong fixture marker/cardinality/identifier before producing evidence',()=>{
  expect(()=>privateMobileTrackingReceipt('bad',[row])).toThrow();expect(()=>privateMobileTrackingReceipt(marker,null as unknown as typeof row[])).toThrow();
  for(const rows of [[],[row,row],[{...row,id:7}],[{...row,id:'bad'}]])expect(()=>privateMobileTrackingReceipt(marker,rows)).toThrow();
 });
});
