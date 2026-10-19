import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import process from 'node:process';
import {URL} from 'node:url';
import {verifySandboxIosArchivePayload} from './sandbox-ios-archive-payload.mjs';

const require=createRequire(new URL('../package.json',import.meta.url)),expo=createRequire(require.resolve('expo/package.json')),plugins=createRequire(expo.resolve('@expo/config-plugins/package.json')),plist=plugins('@expo/plist').default;
const sourceHead='ab'.repeat(20),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const readInfo=bytes=>JSON.stringify(plist.parse(bytes.toString('utf8')));
function fixture(action,{active=true,version='9',defaultVersion=false}={}){
 const root=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'st253-ios-payload-'))),bundle=join(root,'SubTrackSandbox.app'),resources=join(bundle,'EXConstants.bundle');fs.mkdirSync(resources,{recursive:true,mode:0o700});
 if(process.platform==='win32')for(const name of ['lstatSync','fstatSync']){const actual=fs[name];mock.method(fs,name,(...args)=>{const s=actual(...args);return Object.assign(Object.create(Object.getPrototypeOf(s)),s,{mode:s.mode&~0o022});});}syncBuiltinESMExports();
 const info={CFBundleIdentifier:'se.subtrack.app.sandbox',CFBundleVersion:version,CFBundlePackageType:'APPL',DTPlatformName:'iphoneos',CFBundleSupportedPlatforms:['iPhoneOS'],CFBundleExecutable:'SubTrackSandbox'};
 const config={ios:{bundleIdentifier:'se.subtrack.app.sandbox',...(defaultVersion?{}:{buildNumber:version})},android:{package:'se.subtrack.app.sandbox'},extra:{subtrackSandbox:{variant:'sandbox',apiBaseUrl:'https://198.44.116.159',runtimeEnabled:active,publicationEnabled:false,privateDiagnosticsEnabled:false}}};
 const paths={info:join(bundle,'Info.plist'),config:join(resources,'app.config'),hermes:join(bundle,'main.jsbundle'),executable:join(bundle,'SubTrackSandbox')};
 const executable=Buffer.alloc(32);Buffer.from('cffaedfe','hex').copy(executable);executable.writeUInt32LE(0x0100000c,4);executable.writeUInt32LE(2,12);
 fs.writeFileSync(paths.info,plist.build(info),{mode:0o600});fs.writeFileSync(paths.config,JSON.stringify(config),{mode:0o600});fs.writeFileSync(paths.hermes,Buffer.from('c61fbc03c103191f00','hex'),{mode:0o600});fs.writeFileSync(paths.executable,executable,{mode:0o700});
 const input={bundle,sourceHead,runtimeIntent:active?'enabled':'disabled',buildNumber:version};
 try{return action({bundle,paths,input,info,config,verify:port=>verifySandboxIosArchivePayload(input,{readInfo,...port})});}finally{mock.restoreAll();syncBuiltinESMExports();fs.rmSync(root,{recursive:true,force:true});}
}

test('real temporary app/plist/config/Hermes output produces only measured hashes and honest unsigned preparation claims',()=>{
 for(const options of [{},{active:false,version:'1',defaultVersion:true}])fixture(f=>{
  const result=f.verify();assert.deepEqual(result,{schema:'st253-ios-unsigned-payload-v1',sourceHead,bundleIdentifier:'se.subtrack.app.sandbox',buildNumber:f.input.buildNumber,runtimeIntent:f.input.runtimeIntent,infoPlistSha256:sha(fs.readFileSync(f.paths.info)),embeddedConfigSha256:sha(fs.readFileSync(f.paths.config)),hermesSha256:sha(fs.readFileSync(f.paths.hermes)),executableSha256:sha(fs.readFileSync(f.paths.executable)),signing:'not-performed',runtimeQualification:'not-performed',installableIpa:false,publicationEnabled:false});assert.equal(Object.isFrozen(result),true);
 },options);
});

test('namespace/version/device-platform/native-binary and embedded runtime discrepancies reject the actual payload',()=>{
 for(const patch of [{CFBundleIdentifier:'se.subtrack.app'},{CFBundleVersion:'8'},{CFBundlePackageType:'BNDL'},{DTPlatformName:'iphonesimulator'},{CFBundleSupportedPlatforms:['iPhoneSimulator']},{CFBundleExecutable:'../foreign'}])fixture(f=>{fs.writeFileSync(f.paths.info,plist.build({...f.info,...patch}));assert.throws(()=>f.verify());});
 for(const patch of [{runtimeEnabled:false},{apiBaseUrl:'https://foreign.invalid'},{publicationEnabled:true},{privateDiagnosticsEnabled:true},{extra:'private-canary'}])fixture(f=>{f.config.extra.subtrackSandbox={...f.config.extra.subtrackSandbox,...patch};fs.writeFileSync(f.paths.config,JSON.stringify(f.config));assert.throws(()=>f.verify());});
 for(const kind of ['config-version','private-plugin','android-namespace','plain-js','binary','wrong-cpu','dylib'])fixture(f=>{
  if(kind==='config-version')f.config.ios.buildNumber='8';if(kind==='private-plugin')f.config.plugins=['./plugins/private-runtime-ca.cjs'];if(kind==='android-namespace')f.config.android.package='se.subtrack.app';fs.writeFileSync(f.paths.config,JSON.stringify(f.config));
  if(kind==='plain-js')fs.writeFileSync(f.paths.hermes,'console.log("private canary")');
  if(kind==='binary')fs.writeFileSync(f.paths.executable,'private canary');
  if(kind==='wrong-cpu'||kind==='dylib'){const bytes=fs.readFileSync(f.paths.executable);bytes.writeUInt32LE(kind==='wrong-cpu'?7:6,kind==='wrong-cpu'?4:12);fs.writeFileSync(f.paths.executable,bytes);}
  assert.throws(()=>f.verify());
 });
});

test('missing/empty/oversized/linked and changed files never produce a stale payload receipt',()=>{
 for(const kind of ['missing','empty','oversized','linked-directory','hardlink','changed-after-read','invalid-json','duplicate-json'])fixture(f=>{
  if(kind==='missing')fs.unlinkSync(f.paths.hermes);if(kind==='empty')fs.writeFileSync(f.paths.hermes,'');if(kind==='oversized')fs.writeFileSync(f.paths.config,Buffer.alloc(262145));
  if(kind==='linked-directory'){const resources=join(f.bundle,'EXConstants.bundle');fs.renameSync(resources,resources+'-retained');fs.symlinkSync(resources+'-retained',resources,'junction');}
  if(kind==='hardlink'){fs.unlinkSync(f.paths.config);fs.linkSync(f.paths.info,f.paths.config);}
  if(kind==='invalid-json')fs.writeFileSync(f.paths.config,'private-canary');if(kind==='duplicate-json')fs.writeFileSync(f.paths.config,'{"ios":{},"ios":{}}');
  assert.throws(()=>f.verify(kind==='changed-after-read'?{readInfo:bytes=>{const info=readInfo(bytes);fs.appendFileSync(f.paths.config,' ');return info;}}:{}));
 });
 for(const patch of [{sourceHead:'private-canary'},{runtimeIntent:'true'},{buildNumber:'0'},{buildNumber:'01'},{buildNumber:'2147483648'}])fixture(f=>assert.throws(()=>verifySandboxIosArchivePayload({...f.input,...patch},{readInfo})));
});
