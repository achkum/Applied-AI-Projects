// Local read-only configuration/tool inventory. This is not device qualification.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(app, 'app.json'), 'utf8')).expo;
for (const [file, size] of [['icon.png',1024],['splash.png',512],['adaptive-icon.png',1024]]) {
  const bytes = fs.readFileSync(path.join(app, 'assets', file));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.subarray(12,16).toString('ascii'),'IHDR');
  assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
}
assert.equal(config.icon,'./assets/icon.png');
assert.equal(config.splash.image,'./assets/splash.png');
assert.equal(config.android.adaptiveIcon.foregroundImage,'./assets/adaptive-icon.png');
assert.equal(config.ios.supportsTablet,true);assert.equal(config.ios.supportsTabletMode,undefined);
const eas = JSON.parse(fs.readFileSync(path.join(app, 'eas.json'), 'utf8'));
assert.equal(eas.build.development.distribution,'internal');
assert.equal(eas.build.development.ios.simulator,true);
assert.equal(eas.build.development.env.EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED,'false');
for (const profile of ['preview','production']) {
  assert.equal(eas.build[profile].env.EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED,undefined);
  assert.equal(eas.build[profile].env.EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL,undefined);
}
const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
assert.equal(pkg.dependencies.expo,'~51.0.0');assert.equal(pkg.dependencies['react-native'],'0.74.5');
process.stdout.write('PASS ST244_NATIVE_CONFIG_AND_ASSET_INPUTS\n');
for (const [name,args] of [['java',['-version']],['adb',['version']],['emulator',['-version']],['xcodebuild',['-version']]]) {
  const result = spawnSync(name,args,{windowsHide:true,stdio:'ignore',timeout:5000});
  process.stdout.write(`ST244_LOCAL_TOOL ${name}=${result.status===0?'available':'unavailable'}\n`);
}
process.stdout.write('ST244_NATIVE_DEVICE_QUALIFICATION=pending\n');
