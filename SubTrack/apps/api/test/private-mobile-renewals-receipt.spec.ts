import {describe,it,expect} from 'vitest';
import {privateMobileRenewalsReceipt} from './private-mobile-renewals-receipt.js';
import {privateMobileTrackingReceipt} from './private-mobile-tracking-receipt.js';
const marker='a'.repeat(32),candidate='2026-10-16';
const row={id:'123e4567-e89b-42d3-a456-426614174000',custom_name:'Example streaming',category_code:'VIDEO_STREAMING',cadence:'MONTHLY',expected_amount_minor:'12990',currency:'SEK',source:'MANUAL',status:'ACTIVE',revision:'1',next_charge_date:candidate,always_private:true};
const archived={...row,custom_name:'Example streaming Plus',status:'ARCHIVED',revision:'6',next_charge_date:null};
describe('closed same-row native renewal observer',()=>{
 it('binds original saved date/state and archived empty state without emitting row values or claiming device membership',()=>{
  const active=privateMobileRenewalsReceipt(marker,[row],candidate),empty=privateMobileRenewalsReceipt(marker,[archived],candidate);
  expect(active).toMatchObject({version:1,subscriptionCount:1,activeSavedDateReadback:true,archivedEmptyReadback:false});expect(empty).toMatchObject({activeSavedDateReadback:false,archivedEmptyReadback:true});
  expect(active.subscriptionIdentityHash).toBe(empty.subscriptionIdentityHash);expect(active.subscriptionDigest).not.toBe(empty.subscriptionDigest);
  expect(JSON.stringify(active)).not.toContain(row.id);expect(JSON.stringify(active)).not.toContain(candidate);expect(JSON.stringify(active)).not.toContain(row.custom_name);
  expect(Object.keys(active).sort()).toEqual(['version','markerHash','subscriptionCount','subscriptionIdentityHash','subscriptionDigest','activeSavedDateReadback','archivedEmptyReadback'].sort());expect(Object.isFrozen(active)).toBe(true);
  const tracking=privateMobileTrackingReceipt(marker,[archived]);expect(empty.subscriptionDigest).toBe(tracking.subscriptionDigest);expect(empty.subscriptionIdentityHash).toBe(tracking.subscriptionIdentityHash);
 });
 it('requires each common protected predicate and exact active/archived values',()=>{
  for(const field of ['source','currency','category_code','cadence','expected_amount_minor','always_private'] as const){for(const source of [row,archived]){const changed={...source,[field]:field==='always_private'?false:'different'};const value=privateMobileRenewalsReceipt(marker,[changed],candidate);expect(value.activeSavedDateReadback).toBe(false);expect(value.archivedEmptyReadback).toBe(false);}}
  for(const field of ['custom_name','status','revision','next_charge_date'] as const){const active=privateMobileRenewalsReceipt(marker,[{...row,[field]:'different'}],candidate);expect(active.activeSavedDateReadback).toBe(false);const final=privateMobileRenewalsReceipt(marker,[{...archived,[field]:'different'}],candidate);expect(final.archivedEmptyReadback).toBe(false);}
 });
 it('rejects malformed markers/cardinality/IDs/candidate dates without evidence',()=>{
  for(const value of [null,'bad','A'.repeat(32),'a'.repeat(32)+'\n'])expect(()=>privateMobileRenewalsReceipt(value as unknown as string,[row],candidate)).toThrow();
  for(const rows of [null,[],[row,row],[{...row,id:7}],[{...row,id:'bad'}],[{...row,id:'Z'.repeat(36)}]])expect(()=>privateMobileRenewalsReceipt(marker,rows as unknown as typeof row[],candidate)).toThrow();
  for(const date of [null,'bad','2026-1-01','0000-01-01','2026-13-01','2026-02-30'])expect(()=>privateMobileRenewalsReceipt(marker,[row],date as unknown as string)).toThrow();
  expect(privateMobileRenewalsReceipt(marker,[{...row,next_charge_date:'2024-02-29'}],'2024-02-29').activeSavedDateReadback).toBe(true);
 });
});
