import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSandboxHouseholdRequest,parseSandboxHouseholdView,SANDBOX_HOUSEHOLD_OPERATIONS} from '../sandbox-household.ts';
const admin='123e4567-e89b-42d3-a456-426614174000',child='123e4567-e89b-42d3-a456-426614174001',subscription='123e4567-e89b-42d3-a456-426614174002';
const view=()=>({household:{id:admin,name:'Example family',members:[{id:admin,displayName:'Example parent',role:'ADMIN'},{id:child,displayName:'Example child',role:'DEPENDANT'}],assignments:[{subscriptionId:subscription,memberIds:[admin,child],payerMemberId:null}]}});
test('strict household operations accept only typed membership/usage targets without owner selectors',()=>{
 const bodies={'household-read':{},'household-create':{name:'Example family'},'household-rename':{name:'New family'},'dependant-add':{requestId:child,displayName:'Example child'},'dependant-edit':{memberId:child,displayName:'New name'},'dependant-remove':{memberId:child},'household-assign':{subscriptionId:subscription,memberIds:[admin,child],payerMemberId:child}};
 for(const operation of SANDBOX_HOUSEHOLD_OPERATIONS){assert.deepEqual(parseSandboxHouseholdRequest(operation,bodies[operation]),bodies[operation]);assert.throws(()=>parseSandboxHouseholdRequest(operation,{...bodies[operation],ownerId:admin}));}
 assert.deepEqual(parseSandboxHouseholdRequest('household-assign',{subscriptionId:subscription,memberIds:[],payerMemberId:null}),{subscriptionId:subscription,memberIds:[],payerMemberId:null});
 for(const body of [{subscriptionId:subscription,memberIds:[admin,admin],payerMemberId:null},{subscriptionId:subscription,memberIds:Array(21).fill(admin),payerMemberId:null},{subscriptionId:'foreign',memberIds:[],payerMemberId:null},{subscriptionId:subscription,memberIds:[]}])assert.throws(()=>parseSandboxHouseholdRequest('household-assign',body));
 for(const name of ['', ' leading','trailing ', 'e\u0301','a'.repeat(81),'line\nbreak','\uD800'])assert.throws(()=>parseSandboxHouseholdRequest('household-create',{name}));
});
test('readback preserves only active authorized membership and assignments with exactly one admin',()=>{
 assert.deepEqual(parseSandboxHouseholdView({household:null}),{household:null});assert.deepEqual(parseSandboxHouseholdView(view()),view());
 for(const mutate of [v=>v.household.members.pop(),v=>v.household.members[1].role='ADMIN',v=>v.household.members[1].role='MEMBER',v=>v.household.members[1].id=admin,v=>v.household.assignments[0].memberIds=['123e4567-e89b-42d3-a456-426614174099'],v=>v.household.assignments.push({...v.household.assignments[0]}),v=>v.household.assignments[0].payerMemberId='123e4567-e89b-42d3-a456-426614174099',v=>v.household.ownerId=admin]){const v=view();mutate(v);assert.throws(()=>parseSandboxHouseholdView(v));}
 const one=view();one.household.members=[one.household.members[0]];one.household.assignments=[];assert.deepEqual(parseSandboxHouseholdView(one),one);
});
test('hostile object properties are rejected without running getters',()=>{
 let accessed=false;const body={};Object.defineProperty(body,'name',{enumerable:true,get(){accessed=true;throw new Error('private');}});
 assert.throws(()=>parseSandboxHouseholdRequest('household-create',body));assert.equal(accessed,false);
 for(const value of [null,[],true,Object.create(null),Object.create({name:'Inherited'})])assert.throws(()=>parseSandboxHouseholdRequest('household-read',value));
 assert.throws(()=>parseSandboxHouseholdRequest('unknown',{}));
});
