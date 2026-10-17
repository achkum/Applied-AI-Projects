import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

export const IOS_SIMULATOR_CHECKS=Object.freeze(['DEVICES_QUERY','DEVICES_TIMEOUT','DEVICES_JSON','DEVICES_SHAPE','BOOT_COUNT','RUNTIME','UDID','NAME','AVAILABLE','TYPE','APPS_QUERY','APPS_TIMEOUT','APPS_CONVERT','APPS_CONVERT_TIMEOUT','APPS_JSON','APPS_SHAPE','APP_PRESENT','SNAPSHOT_MATCH']);
const timeoutChecks={DEVICES_QUERY:'DEVICES_TIMEOUT',APPS_QUERY:'APPS_TIMEOUT',APPS_CONVERT:'APPS_CONVERT_TIMEOUT'};
export function iosMeasurementStep(check,action){
 try{return action();}catch(error){const category=error?.code==='ETIMEDOUT'&&timeoutChecks[check]||check;throw Object.assign(new Error('iOS simulator measurement unavailable'),{iosSimulatorCheck:category});}
}
export function iosMeasurementCategory(error){return IOS_SIMULATOR_CHECKS.includes(error?.iosSimulatorCheck)?error.iosSimulatorCheck:'UNKNOWN';}
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const requireCheck=(check,value)=>iosMeasurementStep(check,()=>assert.ok(value));
export function measuredIosSimulator(devices,apps,udid){
 requireCheck('DEVICES_SHAPE',record(devices)&&record(devices.devices)&&Object.values(devices.devices).every(items=>Array.isArray(items)&&items.every(record)));
 const runtime='com.apple.CoreSimulator.SimRuntime.iOS-26-2',rows=Object.entries(devices.devices).flatMap(([version,items])=>items.filter(device=>device.state==='Booted').map(device=>({version,...device})));
 requireCheck('BOOT_COUNT',rows.length===1);const device=rows[0];
 requireCheck('RUNTIME',device.version===runtime);requireCheck('UDID',device.udid===udid);requireCheck('NAME',device.name==='SubTrack-proof');requireCheck('AVAILABLE',device.isAvailable===true);requireCheck('TYPE',device.deviceTypeIdentifier==='com.apple.CoreSimulator.SimDeviceType.iPhone-17');
 requireCheck('APPS_SHAPE',record(apps));requireCheck('APP_PRESENT',!Object.hasOwn(apps,'se.subtrack.app')&&!Object.hasOwn(apps,'se.subtrack.app.sandbox'));
 return {runtime,udid,name:device.name,deviceType:device.deviceTypeIdentifier};
}
export function measureIosSimulator(udid,execute=execFileSync){
 const options={encoding:'utf8',timeout:15000,maxBuffer:4194304,stdio:['ignore','pipe','pipe']};
 const devicesText=iosMeasurementStep('DEVICES_QUERY',()=>execute('xcrun',['simctl','list','devices','booted','--json'],options));
 const devices=iosMeasurementStep('DEVICES_JSON',()=>JSON.parse(devicesText));
 const plist=iosMeasurementStep('APPS_QUERY',()=>execute('xcrun',['simctl','listapps',udid],{timeout:15000,maxBuffer:4194304,stdio:['ignore','pipe','pipe']}));
 const appsText=iosMeasurementStep('APPS_CONVERT',()=>execute('/usr/bin/plutil',['-convert','json','-o','-','-'],{input:plist,encoding:'utf8',timeout:15000,maxBuffer:4194304,stdio:['pipe','pipe','pipe']}));
 const apps=iosMeasurementStep('APPS_JSON',()=>JSON.parse(appsText));
 return measuredIosSimulator(devices,apps,udid);
}
