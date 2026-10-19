import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import process from 'node:process';

const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(resolve(app,'package.json'));
const expoRequire=createRequire(require.resolve('expo/package.json'));
const {getConfig}=expoRequire('@expo/config');
const {IOSConfig}=expoRequire('@expo/config-plugins');

/** Validated build intent only; no installed-runtime or signing qualification. */
export function sandboxIosBuildIntent(config){
 const marker=config?.extra?.subtrackSandbox;
 assert.ok(marker&&Object.getPrototypeOf(marker)===Object.prototype);
 assert.deepEqual(Object.keys(marker).sort(),['variant','apiBaseUrl','runtimeEnabled','publicationEnabled','privateDiagnosticsEnabled'].sort());
 assert.equal(marker.variant,'sandbox');assert.equal(marker.apiBaseUrl,'https://198.44.116.159');
 assert.equal(marker.publicationEnabled,false);assert.equal(marker.privateDiagnosticsEnabled,false);
 assert.equal(typeof marker.runtimeEnabled,'boolean');
 assert.equal(config.ios?.bundleIdentifier,'se.subtrack.app.sandbox');
 const buildNumber=IOSConfig.Version.getBuildNumber(config);
 assert.ok(typeof buildNumber==='string'&&/^[1-9][0-9]*$/.test(buildNumber)&&Number.isSafeInteger(Number(buildNumber))&&Number(buildNumber)<=2147483647);
 return Object.freeze({runtimeIntent:marker.runtimeEnabled?'enabled':'disabled',buildNumber});
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  assert.equal(process.argv.length,2);
  const intent=sandboxIosBuildIntent(getConfig(app,{isPublicConfig:true,skipSDKVersionRequirement:true}).exp);
  process.stdout.write(`${intent.runtimeIntent} ${intent.buildNumber}\n`);
 }catch{
  process.stderr.write('Sandbox iOS build intent unavailable\n');process.exitCode=1;
 }
}
