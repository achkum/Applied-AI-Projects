'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{migrationPlan,migrationNames}=require('./bootstrap.cjs');
const hashes=['a','b','c','d'].map(c=>c.repeat(64));
const rows=n=>hashes.slice(0,n).map((sha256,i)=>({id:i+1,sha256}));
test('fresh install and additive upgrade select exact unapplied migrations without replaying foundations',()=>{
 assert.deepEqual(migrationPlan([],hashes),migrationNames);
 assert.deepEqual(migrationPlan(rows(2),hashes),migrationNames.slice(2));
 assert.deepEqual(migrationPlan(rows(3),hashes),migrationNames.slice(3));
 assert.deepEqual(migrationPlan(rows(4),hashes),[]);
 const before=JSON.stringify(rows(2));migrationPlan(rows(2),hashes);assert.equal(JSON.stringify(rows(2)),before);
});
test('wrong checksum, unknown version, gap, reordered or missing foundation fail closed',()=>{
 for(const input of [rows(1),[{id:2,sha256:hashes[1]}],rows(2).reverse(),[{id:1,sha256:hashes[0]},{id:3,sha256:hashes[2]}],rows(2).map((r,i)=>i?{...r,sha256:hashes[3]}:r),[...rows(4),{id:5,sha256:hashes[0]}]])assert.throws(()=>migrationPlan(input,hashes));
 for(const input of [[],hashes.slice(0,2),[...hashes.slice(0,3),'bad']])assert.throws(()=>migrationPlan(rows(2),input));
});
