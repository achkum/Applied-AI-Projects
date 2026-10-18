import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
import test from 'node:test';
import {sandboxIosBuildIntent} from './sandbox-ios-build-intent.mjs';

const helper=fileURLToPath(new URL('./sandbox-ios-build-intent.mjs',import.meta.url));
const sandbox={SUBTRACK_APP_VARIANT:'sandbox',SUBTRACK_SANDBOX_HTTPS_ORIGIN:'https://198.44.116.159'};
const names=['SUBTRACK_APP_VARIANT','SUBTRACK_SANDBOX_HTTPS_ORIGIN','SUBTRACK_SANDBOX_RUNTIME_ENABLED','SUBTRACK_SANDBOX_VERSION_CODE','SUBTRACK_PRIVATE_DEVICE_PROOF','SUBTRACK_PRIVATE_CA_CERT','SUBTRACK_PRIVATE_FIXTURE_CONFIG','EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC','EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED','EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL'];
function run(extra={}){
 const env={...process.env};for(const name of names)delete env[name];
 return spawnSync(process.execPath,[helper],{env:{...env,...extra},encoding:'utf8',timeout:20000});
}

test('actual CLI loads real Expo sandbox config and reports default, active and disabled version intent accurately',()=>{
 for(const [extra,expected] of [[sandbox,'disabled 1\n'],[{...sandbox,SUBTRACK_SANDBOX_RUNTIME_ENABLED:'true',SUBTRACK_SANDBOX_VERSION_CODE:'8'},'enabled 8\n'],[{...sandbox,SUBTRACK_SANDBOX_RUNTIME_ENABLED:'false',SUBTRACK_SANDBOX_VERSION_CODE:'9'},'disabled 9\n']]){
  const result=run(extra);assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');assert.equal(result.stdout,expected);
 }
});

test('actual CLI rejects missing active version, production, foreign endpoint and private proof contamination without disclosing values',()=>{
 for(const extra of [{},{...sandbox,SUBTRACK_SANDBOX_RUNTIME_ENABLED:'true'},{...sandbox,SUBTRACK_SANDBOX_HTTPS_ORIGIN:'https://foreign.invalid/private-canary'},{...sandbox,SUBTRACK_PRIVATE_CA_CERT:'private-canary'},{...sandbox,SUBTRACK_SANDBOX_VERSION_CODE:'01'}]){
  const result=run(extra);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'Sandbox iOS build intent unavailable\n');
 }
});

test('intent projection refuses publication, diagnostic, namespace and version mismatches',()=>{
 const config={ios:{bundleIdentifier:'se.subtrack.app.sandbox',buildNumber:'3'},extra:{subtrackSandbox:{variant:'sandbox',apiBaseUrl:sandbox.SUBTRACK_SANDBOX_HTTPS_ORIGIN,runtimeEnabled:true,publicationEnabled:false,privateDiagnosticsEnabled:false}}};
 for(const patch of [{publicationEnabled:true},{privateDiagnosticsEnabled:true},{runtimeEnabled:'true'},{apiBaseUrl:'https://other.invalid'},{variant:'production'},{extra:true}])assert.throws(()=>sandboxIosBuildIntent({...config,extra:{subtrackSandbox:{...config.extra.subtrackSandbox,...patch}}}));
 for(const buildNumber of ['0','01','2147483648','3\n'])assert.throws(()=>sandboxIosBuildIntent({...config,ios:{...config.ios,buildNumber}}));
 assert.throws(()=>sandboxIosBuildIntent({...config,ios:{...config.ios,bundleIdentifier:'se.subtrack.app'}}));
 assert.equal(Object.isFrozen(sandboxIosBuildIntent(config)),true);
});

test('unsigned archive consumes validated intent and checks actual plist version before reporting preparation only',()=>{
 const source=readFileSync(new URL('../../../tools/sandbox/build-ios.sh',import.meta.url),'utf8');
 const config=source.indexOf('ios_intent="$(node scripts/sandbox-ios-build-intent.mjs)"'),archive=source.indexOf('CODE_SIGNING_ALLOWED=NO archive');
 const measured=source.indexOf("/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion'");
 assert.ok(config>0&&config<archive&&archive<measured&&measured<source.indexOf("printf 'ST250_IOS_UNSIGNED_ARCHIVE_PASS"));
 assert.ok(source.includes('"$bundle/Info.plist")" == "$build_number" ]'));
 assert.equal(source.includes('runtime=disabled'),false);
 for(const line of source.split('\n').filter(line=>line.includes("printf 'ST250_IOS_"))){assert.ok(line.includes('runtime_intent=%s'));assert.ok(line.includes('runtime_qualification=not-performed'));assert.ok(line.includes('installable_ipa=false'));assert.ok(line.includes('"$runtime_intent" "$build_number"'));}
});
