import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {measureIosSimulator,measuredIosSimulator,iosMeasurementCategory,iosMeasurementStep,IOS_SIMULATOR_CHECKS} from './private-runtime-ios-simulator-measurement.mjs';

const udid='123E4567-E89B-42D3-A456-426614174000',runtime='com.apple.CoreSimulator.SimRuntime.iOS-26-2';
const device=()=>({udid,name:'SubTrack-proof',state:'Booted',isAvailable:true,deviceTypeIdentifier:'com.apple.CoreSimulator.SimDeviceType.iPhone-17'});
const devices=()=>({devices:{[runtime]:[device()]}});
const category=(expected,action)=>assert.throws(action,error=>{assert.equal(iosMeasurementCategory(error),expected);assert.equal(error.message,'iOS simulator measurement unavailable');return true;});
const execute=(change=()=>{})=>{let index=0;return(program,args,options)=>{index++;assert.equal(options.timeout,15000);assert.equal(options.maxBuffer,4194304);assert.equal(options.stdio[1],'pipe');assert.equal(options.stdio[2],'pipe');change(index,options);if(index===1){assert.equal(program,'xcrun');assert.deepEqual(args,['simctl','list','devices','booted','--json']);return JSON.stringify(devices());}if(index===2){assert.equal(program,'xcrun');assert.deepEqual(args,['simctl','listapps',udid]);return 'private plist canary';}assert.equal(index,3);assert.equal(program,'/usr/bin/plutil');assert.deepEqual(args,['-convert','json','-o','-','-']);assert.equal(options.input,'private plist canary');return '{}';};};

test('native measurement uses original bounded inventory commands and exact owned identity',()=>{
 const value=measureIosSimulator(udid,execute());assert.deepEqual(value,{runtime,udid,name:'SubTrack-proof',deviceType:device().deviceTypeIdentifier});
 const original=cp.execFileSync;try{mock.method(cp,'execFileSync',execute());syncBuiltinESMExports();assert.deepEqual(measureIosSimulator(udid),value);}finally{mock.restoreAll();cp.execFileSync=original;syncBuiltinESMExports();}
 assert.equal(iosMeasurementStep('SNAPSHOT_MATCH',()=>42),42);
});
test('each native query or conversion failure/timeout becomes a fixed category without private error text',()=>{
 for(const [index,stage,timeout]of [[1,'DEVICES_QUERY','DEVICES_TIMEOUT'],[2,'APPS_QUERY','APPS_TIMEOUT'],[3,'APPS_CONVERT','APPS_CONVERT_TIMEOUT']])for(const code of ['ETIMEDOUT','ENOBUFS','EIO']){
  category(code==='ETIMEDOUT'?timeout:stage,()=>measureIosSimulator(udid,execute(at=>{if(at===index)throw Object.assign(new Error('private error canary'),{code,stdout:'private output canary'});})));
 }
 category('SNAPSHOT_MATCH',()=>iosMeasurementStep('SNAPSHOT_MATCH',()=>{throw null;}));
 assert.equal(iosMeasurementCategory(null),'UNKNOWN');assert.equal(iosMeasurementCategory({iosSimulatorCheck:'private category canary'}),'UNKNOWN');assert.ok(Object.isFrozen(IOS_SIMULATOR_CHECKS));
});
test('invalid native JSON is separated from query failure',()=>{
 for(const [bad,expected]of [[1,'DEVICES_JSON'],[3,'APPS_JSON']]){let count=0;const next=execute();category(expected,()=>measureIosSimulator(udid,(...args)=>{const value=next(...args);return ++count===bad?'private invalid JSON canary':value;}));}
});
test('invalid device or app shapes never enter inventory traversal or authorize readiness',()=>{
 for(const value of [null,[],{}, {devices:null},{devices:[]},{devices:{[runtime]:null}},{devices:{[runtime]:[null]}},{devices:{[runtime]:[[]]}}])category('DEVICES_SHAPE',()=>measuredIosSimulator(value,{},udid));
 for(const value of [null,[],false])category('APPS_SHAPE',()=>measuredIosSimulator(devices(),value,udid));
});
test('all original device and absent-app authority predicates remain blocking and specifically classified',()=>{
 for(const [expected,change]of [
  ['BOOT_COUNT',value=>value.devices[runtime].push(device())],
  ['BOOT_COUNT',value=>{value.devices[runtime][0].state='Shutdown';}],
  ['RUNTIME',value=>{value.devices.other=value.devices[runtime];delete value.devices[runtime];}],
  ['UDID',value=>{value.devices[runtime][0].udid='foreign';}],
  ['NAME',value=>{value.devices[runtime][0].name='foreign';}],
  ['AVAILABLE',value=>{value.devices[runtime][0].isAvailable=false;}],
  ['TYPE',value=>{value.devices[runtime][0].deviceTypeIdentifier='foreign';}],
 ]){const value=devices();change(value);category(expected,()=>measuredIosSimulator(value,{},udid));}
 for(const name of ['se.subtrack.app','se.subtrack.app.sandbox'])category('APP_PRESENT',()=>measuredIosSimulator(devices(),{[name]:{}},udid));
});
