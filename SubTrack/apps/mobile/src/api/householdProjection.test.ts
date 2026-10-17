import {projectHouseholdUsage} from './householdProjection';
import {parseSandboxHouseholdView} from '@subtrack/contracts/sandbox-household';
import type {PrivateOwnerSubscriptionView} from '../../../../packages/contracts/generated/types.gen';
const admin='123e4567-e89b-42d3-a456-426614174000',child='123e4567-e89b-42d3-a456-426614174001',sub='123e4567-e89b-42d3-a456-426614174002';
const view=()=>parseSandboxHouseholdView({household:{id:admin,name:'Example family',members:[{id:admin,displayName:'Example parent',role:'ADMIN'},{id:child,displayName:'Example child',role:'DEPENDANT'}],assignments:[{subscriptionId:sub,memberIds:[admin,child],payerMemberId:null}]}});
const row=(overrides:Partial<PrivateOwnerSubscriptionView>={}):PrivateOwnerSubscriptionView=>({id:sub,visibility:'owner',source:'MANUAL',revision:'1',customName:'Example plan',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',status:'ACTIVE',expectedAmountMinor:'101',currency:'SEK',nextChargeDate:null,alwaysPrivate:true,...overrides});
it('allocates every minor unit once with stable remainder to the persisted member order',()=>{
 const result=projectHouseholdUsage(view(),[row()])!;expect(result.monthly.minorUnits).toBe(101n);expect(result.members.map(m=>m.monthly.minorUnits)).toEqual([51n,50n]);expect(result.members.map(m=>m.payerMonthly.minorUnits)).toEqual([0n,0n]);expect(result.unknownPayerMonthly.minorUnits).toBe(101n);expect(result.plans[0]?.payerMemberId).toBeNull();expect(result.plans[0]?.allocations.map(m=>m.minorUnits)).toEqual([51n,50n]);
});
it('only attributes a planned payer when explicitly saved; ownership does not assert payment',()=>{
 const current=parseSandboxHouseholdView({household:{...view().household,assignments:[{subscriptionId:sub,memberIds:[admin,child],payerMemberId:child}]}});
 const result=projectHouseholdUsage(current,[row()])!;expect(result.members.map(m=>m.payerMonthly.minorUnits)).toEqual([0n,101n]);expect(result.unknownPayerMonthly.minorUnits).toBe(0n);expect(result.plans[0]?.payerMemberId).toBe(child);
});
it('uses annual planning conventions, preserves bigints, defaults usage to the owner and excludes inactive/unknown currency or cadence',()=>{
 const current=parseSandboxHouseholdView({household:{...view().household,assignments:[]}});
 const rows=[row({expectedAmountMinor:'9007199254740993',cadence:'ANNUAL'}),row({id:child,status:'PAUSED'}),row({id:admin,cadence:'CUSTOM'}),row({id:admin,currency:'USD'})];
 const result=projectHouseholdUsage(current,rows)!;expect(result.plans).toHaveLength(1);expect(result.monthly.minorUnits).toBe(750599937895083n);expect(result.members[0]?.monthly.minorUnits).toBe(result.monthly.minorUnits);expect(result.members[1]?.monthly.minorUnits).toBe(0n);expect(result.plans[0]?.memberIds).toEqual([admin]);
});
it('has no household projection without durable membership and no invented totals on empty history',()=>{
 expect(projectHouseholdUsage({household:null},[row()])).toBeNull();const result=projectHouseholdUsage(view(),[])!;expect(result.monthly.minorUnits).toBe(0n);expect(result.plans).toEqual([]);expect(result.members.every(m=>m.subscriptionCount===0)).toBe(true);
});
