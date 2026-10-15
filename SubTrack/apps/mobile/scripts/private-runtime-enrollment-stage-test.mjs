import {URL} from 'node:url';
import {createRequire} from 'node:module';
import {format} from 'node:util';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {enrollmentStageDiagnostic,startupStageDiagnostic} from './private-runtime-enrollment-stage.mjs';
const parse=log=>enrollmentStageDiagnostic({phase:'flow-identifier',log});
const calibration='ST244_ENROLLMENT calibration=mounted';
test('exact phase, bounded input, actual calibration and closed full-line markers are mandatory',()=>{
 for(const input of [{phase:'flow-enroll-add',log:calibration},{phase:'flow-identifier',log:null},{phase:'flow-identifier',log:'x'.repeat(4000001)}])assert.equal(enrollmentStageDiagnostic(input),null);
 for(const log of ['', 'private-canary', 'ST244_ENROLLMENT stage=fetch-entered',`${calibration}\nST244_ENROLLMENT stage=private-canary`,`${calibration}\nST244_ENROLLMENT stage=fetch-entered private-canary`,`${calibration}\nBearer-private-canary ST244_ENROLLMENT stage=fetch-entered`,'ST244_ENROLLMENT calibration=private-canary'])assert.equal(parse(log),null);
});
test('known stages are bounded observations, missing stages are unobserved, new calibration resets stale counts',()=>{
 const alone=parse(calibration);assert.ok(Object.isFrozen(alone));assert.equal(Object.keys(alone).length,16);for(const count of Object.values(alone))assert.equal(count,'unobserved');
 const result=parse(`private-canary\n LOG  ${calibration}\n INFO ST244_ENROLLMENT stage=submit-valid\n\u001b[31mST244_ENROLLMENT stage=fetch-entered\u001b[0m\nST244_ENROLLMENT stage=fetch-entered\nST244_ENROLLMENT stage=fetch-entered`);assert.equal(result['submit-valid'],'one');assert.equal(result['fetch-entered'],'multiple');assert.equal(result['flow-committed'],'unobserved');assert.equal(JSON.stringify(result).includes('canary'),false);
 const reset=parse(`${calibration}\nST244_ENROLLMENT stage=fetch-entered\n${calibration}\nST244_ENROLLMENT stage=config-rejected`);assert.equal(reset['fetch-entered'],'unobserved');assert.equal(reset['config-rejected'],'one');
 for(const stage of Object.keys(alone))assert.equal(parse(`${calibration}\nST244_ENROLLMENT stage=${stage}`)[stage],'one');
});

test('startup projection requires valid root evidence and never treats absent transport as absent UI',()=>{
 const parse=log=>startupStageDiagnostic({phase:'flow-identifier',log});
 for(const input of [{phase:'flow-enroll-add',log:''},{phase:'flow-identifier',log:null},{phase:'flow-identifier',log:'x'.repeat(4000001)}])assert.equal(startupStageDiagnostic(input),null);
 for(const log of ['', 'private-canary','ST244_STARTUP stage=fonts-ready','ST244_STARTUP stage=welcome-committed','ST244_STARTUP stage=private-canary','ST244_STARTUP stage=root-entered private-canary','Bearer private-canary ST244_STARTUP stage=root-entered'])assert.equal(parse(log),null);
 const root='ST244_STARTUP stage=root-entered';assert.deepEqual(parse(root),{'root-entered':'one','fonts-ready':'unobserved','welcome-committed':'unobserved'});
 const result=parse(`${root}\n INFO ST244_STARTUP stage=fonts-ready\nLOG ST244_STARTUP stage=welcome-committed\n${root}\n${root}`);assert.ok(Object.isFrozen(result));assert.deepEqual(result,{'root-entered':'multiple','fonts-ready':'one','welcome-committed':'one'});
 assert.equal(parse(`${root}\nST244_STARTUP private-canary`),null);
});

test('actual pinned Expo config and terminal reporter forward INFO markers in the accepted format',()=>{
 const appRequire=createRequire(new URL('../package.json',import.meta.url)),expoRequire=createRequire(appRequire.resolve('expo/package.json')),cliRequire=createRequire(expoRequire.resolve('@expo/cli/package.json'));
 assert.equal(appRequire('./metro.config.js').server.forwardClientLogs,true);
 const {MetroTerminalReporter}=cliRequire('./build/src/start/server/metro/MetroTerminalReporter.js');const captured=[];
 const reporter={shouldFilterClientLog:MetroTerminalReporter.prototype.shouldFilterClientLog,terminal:{log:(...args)=>captured.push(format(...args))}};
 MetroTerminalReporter.prototype._log.call(reporter,{type:'client_log',level:'info',data:['ST244_STARTUP stage=root-entered']});
 assert.equal(startupStageDiagnostic({phase:'flow-identifier',log:captured.join('\n')})['root-entered'],'one');
 const native=readFileSync(appRequire.resolve('react-native/Libraries/Core/setUpDeveloperTools.js'),'utf8');assert.match(native,/console\._isPolyfilled/);assert.match(native,/HMRClient\.log\(level, args\)/);
 const build=readFileSync(new URL('./private-runtime-build.sh',import.meta.url),'utf8');assert.match(build,/expo start --localhost --port 8081 > "\$proof_root\/private\/metro\.log" 2>&1/);
});
